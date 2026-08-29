'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { majors, timetableEvents, times, type DegreeTrack, type Major, type TimetableEvent } from './timetable-data';

type LaidEvent=TimetableEvent&{lane:number;laneCount:number};

function arrange(events:TimetableEvent[]):LaidEvent[]{
  const result:LaidEvent[]=[];
  for(let day=0;day<5;day++){
    const sorted=events.filter((event)=>event.day===day).sort((a,b)=>a.start-b.start||b.span-a.span);
    let index=0;
    while(index<sorted.length){
      const cluster:TimetableEvent[]=[sorted[index++]];
      let clusterEnd=cluster[0].start+cluster[0].span;
      while(index<sorted.length&&sorted[index].start<clusterEnd){
        cluster.push(sorted[index]); clusterEnd=Math.max(clusterEnd,sorted[index].start+sorted[index].span); index++;
      }
      const laneEnds:number[]=[]; const assigned:{event:TimetableEvent;lane:number}[]=[];
      cluster.forEach((event)=>{
        let lane=laneEnds.findIndex((end)=>end<=event.start);
        if(lane<0){lane=laneEnds.length;laneEnds.push(0)}
        laneEnds[lane]=event.start+event.span; assigned.push({event,lane});
      });
      assigned.forEach(({event,lane})=>result.push({...event,lane,laneCount:laneEnds.length}));
    }
  }
  return result;
}

const kindLabels={common:'伯大课程',shared:'专业共享',major:'暨大课程',optional:'选修课程',general:'通识课'};

function audienceLabel(event:TimetableEvent){
  if(event.majors==='all')return '';
  const audience=new Set(event.majors);
  if(audience.size===2&&audience.has('MAM')&&audience.has('ICS'))return 'MAM/ICS';
  if(audience.size===2&&audience.has('Econ')&&audience.has('Stat'))return 'ECON/STAT';
  return '';
}

const degreeLabels:Record<DegreeTrack,string>={dual:'双学位',single:'单学位'};
const weekdayNames=['周一','周二','周三','周四','周五'];
const weekdayShort=['MON','TUE','WED','THU','FRI'];

type SavedPreferences={track:DegreeTrack;year:number;major:Major;classNo:number};

const preferencesKey='jbji-course-assistant:preferences:v1';
const defaultPreferences:SavedPreferences={track:'dual',year:1,major:'MAM',classNo:1};

function loadPreferences():SavedPreferences{
  if(typeof window==='undefined')return defaultPreferences;
  try{
    const saved=JSON.parse(window.localStorage.getItem(preferencesKey)||'null') as Partial<SavedPreferences>|null;
    if(!saved||typeof saved!=='object')return defaultPreferences;
    return {
      track:saved.track==='dual'||saved.track==='single'?saved.track:defaultPreferences.track,
      year:typeof saved.year==='number'&&[1,2,3,4].includes(saved.year)?saved.year:defaultPreferences.year,
      major:typeof saved.major==='string'&&majors.some((item)=>item.id===saved.major)?saved.major as Major:defaultPreferences.major,
      classNo:typeof saved.classNo==='number'&&[1,2,3].includes(saved.classNo)?saved.classNo:defaultPreferences.classNo,
    };
  }catch{
    return defaultPreferences;
  }
}

function trackLabel(event:TimetableEvent){
  return event.track?degreeLabels[event.track]:'';
}

function uniqueValues(values:(string|undefined)[]){
  return Array.from(new Set(values.filter((value):value is string=>Boolean(value))));
}

function eventDetails(event:TimetableEvent){
  return [event.teacher&&`教师：${event.teacher}`,event.room&&`教室：${event.room}`,event.weeks&&`周次：${event.weeks}`].filter(Boolean).join(' · ');
}

function courseDetails(course:TimetableEvent,events:TimetableEvent[]){
  const related=events.filter((event)=>event.title===course.title);
  const teachers=uniqueValues(related.map((event)=>event.teacher));
  const rooms=uniqueValues(related.map((event)=>event.room));
  const weeks=uniqueValues(related.map((event)=>event.weeks));
  return [teachers.length&&`教师：${teachers.join(' / ')}`,rooms.length&&`教室：${rooms.join(' / ')}`,weeks.length&&`周次：${weeks.join(' / ')}`].filter(Boolean).join(' · ');
}

function downloadFile(url:string,fileName:string){
  const link=document.createElement('a');
  link.href=url; link.download=fileName; link.style.display='none';
  document.body.appendChild(link); link.click(); link.remove();
}

export default function Home(){
  const [savedPreferences]=useState(loadPreferences);
  const [track,setTrack]=useState<DegreeTrack>(savedPreferences.track); const [year,setYear]=useState(savedPreferences.year); const [major,setMajor]=useState<Major>(savedPreferences.major); const [classNo,setClassNo]=useState(savedPreferences.classNo);
  const selectedMajor=majors.find((item)=>item.id===major)!;
  const classCount=year===1?3:year===2?2:0;
  useEffect(()=>{if(classCount&&classNo>classCount)setClassNo(1)},[classCount,classNo]);
  useEffect(()=>{
    try{
      window.localStorage.setItem(preferencesKey,JSON.stringify({track,year,major,classNo} satisfies SavedPreferences));
    }catch{
      // Storage may be unavailable in private browsing or under restrictive browser settings.
    }
  },[track,year,major,classNo]);
  const filtered=useMemo(()=>timetableEvents.filter((event)=>{
    if(event.year!==year)return false;
    if(event.track&&event.track!==track)return false;
    if(event.majors!=='all'&&!event.majors.includes(major))return false;
    if(event.groups&&classCount&&!event.groups.includes(`${major}${classNo}`))return false;
    return true;
  }),[track,year,major,classNo,classCount]);
  const scheduled=useMemo(()=>filtered.filter((event)=>!event.listedOnly),[filtered]);
  const events=useMemo(()=>arrange(scheduled),[scheduled]);
  const courses=useMemo(()=>Array.from(new Map(filtered.map((event)=>[event.title,event])).values()).sort((a,b)=>a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title,'zh-CN')),[filtered]);
  const groupLabel=classCount?`${selectedMajor.label}${classNo}`:selectedMajor.label;
  const scheduleRef=useRef<HTMLElement>(null);
  const [selectedDay,setSelectedDay]=useState<number|'all'>('all');
  const [exporting,setExporting]=useState<'png'|'pdf'|null>(null);
  const [exportMessage,setExportMessage]=useState('');
  const displayedDays=selectedDay==='all'?[0,1,2,3,4]:[selectedDay];
  const displayedEvents=selectedDay==='all'?events:events.filter((event)=>event.day===selectedDay);
  const exportFileName=`JBJI-${degreeLabels[track]}-大${['一','二','三','四'][year-1]}-${selectedMajor.label}${classCount?`-${classNo}班`:''}${selectedDay==='all'?'':`-${weekdayNames[selectedDay]}`}-2026-27第一学期`;

  async function renderScheduleCanvas(){
    if(!scheduleRef.current)throw new Error('找不到课表区域');
    await document.fonts?.ready;
    const clone=scheduleRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>('[data-export-exclude]').forEach((element)=>element.remove());
    clone.querySelectorAll<HTMLElement>('[data-export-only]').forEach((element)=>{element.style.display='block'});
    Object.assign(clone.style,{position:'fixed',left:'-10000px',top:'0',width:'1240px',maxWidth:'none',margin:'0',boxShadow:'none',zIndex:'-1'});
    const tableScroll=clone.querySelector<HTMLElement>('.tableScroll');
    if(tableScroll)tableScroll.style.overflow='visible';
    const timetable=clone.querySelector<HTMLElement>('.timetable');
    if(timetable)timetable.style.gridTemplateRows='50px repeat(12,66px)';
    document.body.appendChild(clone);
    try{
      const {default:html2canvas}=await import('html2canvas');
      return await html2canvas(clone,{backgroundColor:'#ffffff',scale:2,useCORS:true,logging:false});
    }finally{
      clone.remove();
    }
  }

  async function exportSchedule(format:'png'|'pdf'){
    setExporting(format); setExportMessage(format==='png'?'正在生成图片…':'正在生成 PDF…');
    try{
      const canvas=await renderScheduleCanvas();
      if(format==='png'){
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error('图片生成失败')),'image/png'));
        const url=URL.createObjectURL(blob);
        downloadFile(url,`${exportFileName}.png`); URL.revokeObjectURL(url);
      }else{
        const {jsPDF}=await import('jspdf');
        const landscape=canvas.width>=canvas.height;
        const pdf=new jsPDF({orientation:landscape?'landscape':'portrait',unit:'mm',format:'a4',compress:true});
        const pageWidth=pdf.internal.pageSize.getWidth(); const pageHeight=pdf.internal.pageSize.getHeight(); const margin=8;
        const ratio=Math.min((pageWidth-margin*2)/canvas.width,(pageHeight-margin*2)/canvas.height);
        const width=canvas.width*ratio; const height=canvas.height*ratio;
        pdf.addImage(canvas.toDataURL('image/png'),'PNG',(pageWidth-width)/2,(pageHeight-height)/2,width,height,undefined,'FAST');
        pdf.save(`${exportFileName}.pdf`);
      }
      setExportMessage(format==='png'?'图片已导出':'PDF 已导出');
    }catch(error){
      console.error(error); setExportMessage('导出失败，请稍后重试');
    }finally{
      setExporting(null);
    }
  }

  return <main>
    <header className="topbar"><a className="brand" href="#top" aria-label="JBJI课表助手首页"><span className="brandMark"><img className="brandLogo" src="./jbji-logo.png" alt="暨南大学与伯明翰大学院徽"/></span><span className="brandCopy"><strong>JBJI课表助手</strong><small>2026/2027 FALL SEMESTER</small></span></a></header>
    <section className="hero" id="top"><div className="heroBackdrop" aria-hidden="true"><img src="./jbji-banner.jpg" alt=""/></div><div className="heroGuardians" aria-hidden="true"><img className="heroGuardian heroGuardianLeft" src="./jbji-nailong-guardian.png" alt=""/><img className="heroGuardian heroGuardianRight" src="./jbji-nailong-guardian.png" alt=""/></div><div className="heroCopy"><p className="eyebrow">JBJI PERSONAL TIMETABLE</p><h1>一张课表，<br/>看清你的暨伯学期。</h1><p className="lead">选择学位类型、年级、专业与班级，只保留与你相关的课程。双学位与单学位的伯大数学模块会自动切换。</p><div className="heroRule"><span>数学交叉</span><span>双校培养</span><span>四个本科专业</span></div></div><div className="heroStat"><span>当前组合</span><strong>{courses.length}</strong><small>COURSES</small></div></section>
    <section className="filterPanel" aria-label="课表筛选">
      <div className="filterGroup trackGroup"><span>学位类型</span><div className="segmented">{(['dual','single'] as DegreeTrack[]).map((item)=><button key={item} className={track===item?'active':''} onClick={()=>setTrack(item)}><b>{degreeLabels[item]}</b><small>{item==='dual'?'JNU + UoB':'JNU Degree'}</small></button>)}</div></div>
      <div className="filterGroup"><span>年级</span><div className="segmented">{[1,2,3,4].map((item)=><button key={item} className={year===item?'active':''} onClick={()=>setYear(item)}>大{['一','二','三','四'][item-1]}</button>)}</div></div>
      <div className="filterGroup majorGroup"><span>专业</span><div className="segmented">{majors.map((item)=><button key={item.id} className={major===item.id?'active':''} onClick={()=>setMajor(item.id)}><b>{item.label}</b><small>{item.name}</small></button>)}</div></div>
      {classCount>0&&<div className="filterGroup classGroup"><span>班级</span><div className="segmented">{Array.from({length:classCount},(_,i)=>i+1).map((item)=><button key={item} className={classNo===item?'active':''} onClick={()=>setClassNo(item)}>{item} 班</button>)}</div></div>}
    </section>
    <section className="contextBar"><span>正在查看</span><strong>{degreeLabels[track]} · 大{['一','二','三','四'][year-1]} · {selectedMajor.name}{classCount?` · ${classNo} 班`:''}</strong><small>{track==='single'&&year<=3?'已替换为单学位伯大必修模块':year===1?'英语分组已按 E1–E12 对应到专业班级':year===2?'雅思分组已按 E1–E8 对应到专业班级':'本年级不区分英语班级组'}</small></section>
    <section className="scheduleSection" ref={scheduleRef}><div className="sectionHead"><div><p className="eyebrow">{degreeLabels[track].toUpperCase()} · YEAR {year} · {groupLabel}</p><h2>{selectedMajor.name} · {degreeLabels[track]}课表</h2></div><div className="sectionTools"><div className="legend"><span><i className="dot common"/>伯大课程</span><span><i className="dot shared"/>专业共享</span><span><i className="dot own"/>暨大课程</span><span><i className="dot optional"/>选修课程</span></div><div className="exportActions" data-export-exclude><button disabled={exporting!==null} onClick={()=>exportSchedule('png')}>{exporting==='png'?'生成中…':'导出图片'}</button><button className="primary" disabled={exporting!==null} onClick={()=>exportSchedule('pdf')}>{exporting==='pdf'?'生成中…':'导出 PDF'}</button><span className="exportStatus" role="status" aria-live="polite">{exportMessage}</span></div></div></div>
      <div className="scheduleBody"><aside className="dayFilterPanel" aria-label="按上课日查看" data-export-exclude><span>上课日</span><div className="dayFilterButtons"><button className={selectedDay==='all'?'active':''} aria-pressed={selectedDay==='all'} onClick={()=>setSelectedDay('all')}>全部</button>{weekdayNames.map((day,index)=><button className={selectedDay===index?'active':''} aria-pressed={selectedDay===index} onClick={()=>setSelectedDay(index)} key={day}>{['一','二','三','四','五'][index]}</button>)}</div></aside>
      <div className="scheduleContent"><div className="tableScroll"><div className="timetable" style={{gridTemplateColumns:displayedDays.length===1?'72px minmax(480px,1fr)':'72px repeat(5,minmax(165px,1fr))',minWidth:displayedDays.length===1?'620px':'960px'}}><div className="corner">节次</div>{displayedDays.map((day,index)=><div className="dayHead" style={{gridColumn:index+2}} key={day}>{weekdayNames[day]}<small>{weekdayShort[day]}</small></div>)}
        {times.map(([session,from,to],index)=><div className={`timeCell ${session==='5'?'break':''}`} style={{gridRow:index+2}} key={session}><strong>{session}</strong><span>{from}</span>{to&&<small>{to}</small>}</div>)}
        {times.map((_,row)=>displayedDays.map((day,index)=><div className={`gridCell ${row===4?'break':''}`} style={{gridColumn:index+2,gridRow:row+2}} key={`${day}-${row}`}/>))}
        {displayedEvents.map((event)=><article className={`courseBlock tone-${event.kind}`} style={{gridColumn:displayedDays.indexOf(event.day)+2,gridRow:`${event.start+2} / span ${event.span}`,width:`calc((100% - 6px) / ${event.laneCount})`,marginLeft:`calc(${event.lane} * (100% / ${event.laneCount}) + 3px)`}} key={event.id} title={event.note}><span className="courseTag">{event.note||kindLabels[event.kind]}{trackLabel(event)&&` · ${trackLabel(event)}`}{audienceLabel(event)&&` · (${audienceLabel(event)})`}</span><strong>{event.title}</strong>{event.english&&<small className="courseEnglish">{event.english}</small>}{eventDetails(event)&&<small className="courseDetails">{eventDetails(event)}</small>}</article>)}
      </div></div>
      {displayedEvents.length===0&&<div className="emptyState">{selectedDay==='all'?'当前组合暂无已公布上课时间的课程。':`${weekdayNames[selectedDay]}暂无已公布上课时间的课程。`}</div>}</div></div>
      <p className="exportFootnote" data-export-only>JBJI STUDENT TIMETABLE · 2026–27 学年第一学期 · 数据仅供参考，最终安排以学院最新通知为准。</p>
    </section>
    <section className="courseSection"><div className="sectionHead compact"><div><p className="eyebrow">COURSE OVERVIEW</p><h2>本组合课程清单</h2></div><strong className="countBadge">{courses.length} 门</strong></div><div className="courseList">{courses.map((course)=><article className={`courseItem tone-${course.kind}`} key={course.title}><div><span>{kindLabels[course.kind]}{trackLabel(course)&&` · ${trackLabel(course)}`}{audienceLabel(course)&&` · (${audienceLabel(course)})`}</span><strong>{course.title}</strong>{course.english&&<small className="courseEnglish">{course.english}</small>}{courseDetails(course,filtered)&&<small className="courseDetails">{courseDetails(course,filtered)}</small>}</div></article>)}</div></section>
    <aside className="notice"><strong>使用说明</strong><p>双学位模式采用原课表中的 All Progs 数学模块；单学位模式会移除这些模块及其 Seminar，并换成单学位授课安排中的 RA、SAS、FM、MVA、GTMCD 与 IPCO。其他暨大学位课程仍按年级、专业和班级筛选。教室或周次有调整时，以学院最新通知为准。</p></aside>
    <footer><span>JBJI STUDENT TIMETABLE · 非官方学生工具</span><span>数据来源：双学位总课表及单学位伯大必修课程授课安排</span><a href="https://birmingham.jnu.edu.cn/" target="_blank" rel="noreferrer">学院官网 ↗</a></footer>
  </main>;
}
