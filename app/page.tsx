'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { majors, timetableEvents, times, type DegreeTrack, type Major, type TimetableEvent } from './timetable-data';

type DisplaySource='base'|'retake'|'preview';
type DisplayEvent=TimetableEvent&{displaySource?:DisplaySource;retakeKey?:string};
type LaidEvent=DisplayEvent&{lane:number;laneCount:number};
type CourseCategory='uob'|'jnu'|'english'|'general';
type SidebarMode='current'|'retake';
type RetakeOption={key:string;year:number;title:string;english?:string;groups:string[];events:TimetableEvent[]};
type ConflictSeverity='hard'|'partial';
type ConflictDetail={key:string;first:DisplayEvent;second:DisplayEvent;day:number;firstSession:number;lastSession:number;weeks:number[];severity:ConflictSeverity};

function arrange(events:DisplayEvent[]):LaidEvent[]{
  const result:LaidEvent[]=[];
  for(let day=0;day<5;day++){
    const sorted=events.filter((event)=>event.day===day).sort((a,b)=>a.start-b.start||b.span-a.span);
    let index=0;
    while(index<sorted.length){
      const cluster:DisplayEvent[]=[sorted[index++]];
      let clusterEnd=cluster[0].start+cluster[0].span;
      while(index<sorted.length&&sorted[index].start<clusterEnd){
        cluster.push(sorted[index]); clusterEnd=Math.max(clusterEnd,sorted[index].start+sorted[index].span); index++;
      }
      const laneEnds:number[]=[]; const assigned:{event:DisplayEvent;lane:number}[]=[];
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

const categoryLabels:Record<CourseCategory,string>={uob:'伯大',jnu:'暨大',english:'英语',general:'通识课'};

function courseCategory(event:TimetableEvent):CourseCategory{
  const searchable=`${event.title} ${event.english||''}`.toLowerCase();
  if(/英语|雅思|英美历史|english|ielts|history and culture of uk/.test(searchable))return 'english';
  if(/思想道德|中国近代史|马克思主义|体育|军事理论|心理健康|艺术体验/.test(event.title))return 'general';
  if(event.track)return 'uob';
  return 'jnu';
}

function retakeOptionKey(event:TimetableEvent){
  return `${event.year}:${event.title}:${event.groups?.slice().sort().join('+')||'all'}`;
}

function buildRetakeOptions(year:number,major:Major):RetakeOption[]{
  const grouped=new Map<string,RetakeOption>();
  timetableEvents.filter((event)=>event.year<year&&!event.listedOnly&&courseCategory(event)!=='uob'&&(event.majors==='all'||event.majors.includes(major))).forEach((event)=>{
    const key=retakeOptionKey(event);
    const current=grouped.get(key);
    if(current)current.events.push(event);
    else grouped.set(key,{key,year:event.year,title:event.title,english:event.english,groups:event.groups||[],events:[event]});
  });
  return Array.from(grouped.values()).sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title,'zh-CN')||a.key.localeCompare(b.key));
}

function weekNumbers(weeks?:string){
  const result=new Set<number>();
  if(!weeks)return new Set(Array.from({length:18},(_,index)=>index+1));
  const rangePattern=/(\d+)\s*[–—-]\s*(\d+)/g;
  let match:RegExpExecArray|null;
  while((match=rangePattern.exec(weeks))){for(let value=Number(match[1]);value<=Number(match[2]);value++)result.add(value)}
  if(result.size===0){for(const value of weeks.match(/\d+/g)||[])result.add(Number(value))}
  return result.size?result:new Set(Array.from({length:18},(_,index)=>index+1));
}

function detectConflicts(baseEvents:TimetableEvent[],retakeEvents:DisplayEvent[]):ConflictDetail[]{
  const conflicts:ConflictDetail[]=[];
  const compare=(first:DisplayEvent,second:DisplayEvent)=>{
    if(first.day!==second.day)return;
    const start=Math.max(first.start,second.start); const end=Math.min(first.start+first.span,second.start+second.span);
    if(start>=end)return;
    const firstWeeks=weekNumbers(first.weeks); const secondWeeks=weekNumbers(second.weeks);
    const weeks=Array.from(firstWeeks).filter((week)=>secondWeeks.has(week)).sort((a,b)=>a-b);
    if(!weeks.length)return;
    const partial=start>first.start||end<first.start+first.span||weeks.length<firstWeeks.size;
    conflicts.push({key:`${first.id}:${second.id}:${start}`,first,second,day:first.day,firstSession:start+1,lastSession:end,weeks,severity:partial?'partial':'hard'});
  };
  retakeEvents.forEach((retake)=>baseEvents.forEach((base)=>compare(retake,{...base,displaySource:'base'})));
  retakeEvents.forEach((first,index)=>retakeEvents.slice(index+1).forEach((second)=>{if(first.retakeKey!==second.retakeKey)compare(first,second)}));
  return conflicts;
}

function formatWeekList(weeks:number[]){
  if(!weeks.length)return '';
  const ranges:string[]=[]; let start=weeks[0]; let previous=weeks[0];
  for(const week of weeks.slice(1)){
    if(week===previous+1){previous=week;continue}
    ranges.push(start===previous?`${start}`:`${start}–${previous}`); start=previous=week;
  }
  ranges.push(start===previous?`${start}`:`${start}–${previous}`);
  return `第${ranges.join('、')}周`;
}

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
const retakesKey='jbji-course-assistant:retakes:v1';
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

function loadRetakes(){
  if(typeof window==='undefined')return [] as string[];
  try{const saved=JSON.parse(window.localStorage.getItem(retakesKey)||'[]');return Array.isArray(saved)?saved.filter((item):item is string=>typeof item==='string'):[]}
  catch{return []}
}

function courseScheduleDetails(course:TimetableEvent,events:TimetableEvent[]){
  return uniqueValues(events.filter((event)=>event.title===course.title).map((event)=>{
    const first=event.start+1; const last=event.start+event.span;
    return `${weekdayNames[event.day]} · 第${first}${last>first?`–${last}`:''}节`;
  })).join(' / ');
}

function downloadFile(url:string,fileName:string){
  const link=document.createElement('a');
  link.href=url; link.download=fileName; link.style.display='none';
  document.body.appendChild(link); link.click(); link.remove();
}

export default function Home(){
  const [savedPreferences]=useState(loadPreferences);
  const [track,setTrack]=useState<DegreeTrack>(savedPreferences.track); const [year,setYear]=useState(savedPreferences.year); const [major,setMajor]=useState<Major>(savedPreferences.major); const [classNo,setClassNo]=useState(savedPreferences.classNo);
  const [sidebarMode,setSidebarMode]=useState<SidebarMode>('current');
  const [selectedRetakeKeys,setSelectedRetakeKeys]=useState<string[]>(loadRetakes);
  const [previewRetakeKey,setPreviewRetakeKey]=useState<string|null>(null);
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
  useEffect(()=>{
    try{window.localStorage.setItem(retakesKey,JSON.stringify(selectedRetakeKeys))}catch{/* Local storage may be unavailable. */}
  },[selectedRetakeKeys]);
  const filtered=useMemo(()=>timetableEvents.filter((event)=>{
    if(event.year!==year)return false;
    if(event.track&&event.track!==track)return false;
    if(event.majors!=='all'&&!event.majors.includes(major))return false;
    if(event.groups&&classCount&&!event.groups.includes(`${major}${classNo}`))return false;
    return true;
  }),[track,year,major,classNo,classCount]);
  const scheduled=useMemo(()=>filtered.filter((event)=>!event.listedOnly),[filtered]);
  const courses=useMemo(()=>Array.from(new Map(filtered.map((event)=>[event.title,event])).values()).sort((a,b)=>a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title,'zh-CN')),[filtered]);
  const groupLabel=classCount?`${selectedMajor.label}${classNo}`:selectedMajor.label;
  const scheduleRef=useRef<HTMLElement>(null);
  const [selectedDay,setSelectedDay]=useState<number|'all'>('all');
  const [selectedCategory,setSelectedCategory]=useState<CourseCategory|'all'>('all');
  const [courseQuery,setCourseQuery]=useState('');
  const [retakeYear,setRetakeYear]=useState<number|'all'>('all');
  const [retakeCategory,setRetakeCategory]=useState<Exclude<CourseCategory,'uob'>|'all'>('all');
  const [retakeDay,setRetakeDay]=useState<number|'all'>('all');
  const [retakeQuery,setRetakeQuery]=useState('');
  const [exporting,setExporting]=useState<'png'|'pdf'|null>(null);
  const [exportMessage,setExportMessage]=useState('');
  const retakeOptions=useMemo(()=>buildRetakeOptions(year,major),[year,major]);
  const activeSelectedOptions=retakeOptions.filter((option)=>selectedRetakeKeys.includes(option.key));
  const selectedRetakeEvents:DisplayEvent[]=activeSelectedOptions.flatMap((option)=>option.events.map((event)=>({...event,displaySource:'retake' as const,retakeKey:option.key})));
  const previewOption=previewRetakeKey&&!selectedRetakeKeys.includes(previewRetakeKey)?retakeOptions.find((option)=>option.key===previewRetakeKey):undefined;
  const previewRetakeEvents:DisplayEvent[]=previewOption?previewOption.events.map((event)=>({...event,displaySource:'preview' as const,retakeKey:previewOption.key})):[];
  const conflicts=detectConflicts(scheduled,selectedRetakeEvents);
  const hardConflictEventIds=new Set(conflicts.filter((conflict)=>conflict.severity==='hard').flatMap((conflict)=>[conflict.first.id,conflict.second.id]));
  const partialConflictEventIds=new Set(conflicts.filter((conflict)=>conflict.severity==='partial').flatMap((conflict)=>[conflict.first.id,conflict.second.id]));
  const displayedDays=selectedDay==='all'?[0,1,2,3,4]:[selectedDay];
  const normalizedQuery=courseQuery.trim().toLocaleLowerCase('zh-CN');
  const matchingEvents=scheduled.filter((event)=>{
    if(selectedDay!=='all'&&event.day!==selectedDay)return false;
    if(sidebarMode==='current'&&selectedCategory!=='all'&&courseCategory(event)!==selectedCategory)return false;
    if(sidebarMode==='current'&&normalizedQuery&&!`${event.title} ${event.english||''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))return false;
    return true;
  });
  const visibleRetakeEvents=selectedRetakeEvents.filter((event)=>{
    if(selectedDay!=='all'&&event.day!==selectedDay)return false;
    if(sidebarMode==='current'&&selectedCategory!=='all'&&courseCategory(event)!==selectedCategory)return false;
    if(sidebarMode==='current'&&normalizedQuery&&!`${event.title} ${event.english||''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))return false;
    return true;
  });
  const visiblePreviewEvents=previewRetakeEvents.filter((event)=>selectedDay==='all'||event.day===selectedDay);
  const displayedEvents=arrange([...matchingEvents.map((event)=>({...event,displaySource:'base' as const})),...visibleRetakeEvents,...visiblePreviewEvents]);
  const sidebarCourses=Array.from(new Map(matchingEvents.map((event)=>[event.title,event])).values()).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
  const normalizedRetakeQuery=retakeQuery.trim().toLocaleLowerCase('zh-CN');
  const availableRetakeYears=Array.from(new Set(retakeOptions.map((option)=>option.year))).sort((a,b)=>b-a);
  const visibleRetakeOptions=retakeOptions.filter((option)=>{
    if(retakeYear!=='all'&&option.year!==retakeYear)return false;
    if(retakeCategory!=='all'&&courseCategory(option.events[0])!==retakeCategory)return false;
    if(retakeDay!=='all'&&!option.events.some((event)=>event.day===retakeDay))return false;
    if(normalizedRetakeQuery&&!`${option.title} ${option.english||''} ${option.groups.join(' ')}`.toLocaleLowerCase('zh-CN').includes(normalizedRetakeQuery))return false;
    return true;
  });
  const activeFilterLabel=[selectedDay==='all'?'':weekdayNames[selectedDay],selectedCategory==='all'?'':categoryLabels[selectedCategory],courseQuery.trim()].filter(Boolean).join('-');
  const exportFileName=`JBJI-${degreeLabels[track]}-大${['一','二','三','四'][year-1]}-${selectedMajor.label}${classCount?`-${classNo}班`:''}${activeSelectedOptions.length?`-含${activeSelectedOptions.length}门重修`:''}${activeFilterLabel?`-${activeFilterLabel}`:''}-2026-27第一学期`;

  function changeSidebarMode(mode:SidebarMode){
    setSidebarMode(mode); setPreviewRetakeKey(null);
    if(mode==='retake'){setSelectedDay('all');setSelectedCategory('all');setCourseQuery('')}
  }

  function toggleRetake(option:RetakeOption){
    setSelectedRetakeKeys((current)=>current.includes(option.key)?current.filter((key)=>key!==option.key):[...current,option.key]);
    setPreviewRetakeKey(null);
  }

  function optionConflicts(option:RetakeOption){
    const otherSelected=selectedRetakeEvents.filter((event)=>event.retakeKey!==option.key);
    const candidate=option.events.map((event)=>({...event,displaySource:'retake' as const,retakeKey:option.key}));
    const candidateIds=new Set(candidate.map((event)=>event.id));
    return detectConflicts(scheduled,[...otherSelected,...candidate]).filter((conflict)=>candidateIds.has(conflict.first.id)||candidateIds.has(conflict.second.id));
  }

  async function renderScheduleCanvas(){
    if(!scheduleRef.current)throw new Error('找不到课表区域');
    await document.fonts?.ready;
    const clone=scheduleRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>('[data-export-exclude]').forEach((element)=>element.remove());
    clone.querySelectorAll<HTMLElement>('[data-export-only]').forEach((element)=>{element.style.display='block'});
    Object.assign(clone.style,{position:'fixed',left:'-10000px',top:'0',width:'1240px',maxWidth:'none',margin:'0',boxShadow:'none',zIndex:'-1'});
    const scheduleBody=clone.querySelector<HTMLElement>('.scheduleBody');
    if(scheduleBody)scheduleBody.style.gridTemplateColumns='1fr';
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
    <header className="topbar"><a className="brand" href="#top" aria-label="JBJI课表助手首页"><span className="brandMark"><img className="brandLogo" src="./jbji-logo.png" alt="暨南大学与伯明翰大学院徽"/></span><span className="brandCopy"><strong>JBJI课表助手</strong><small>2026/2027 FALL SEMESTER</small></span></a><div className="topbarMascot" aria-label="JBJI 奶龙吉祥物"><img src="./jbji-nailong-guardian.png" alt="印有暨南大学伯明翰大学联合学院标识的奶龙"/></div></header>
    <section className="hero" id="top"><div className="heroBackdrop" aria-hidden="true"><img src="./jbji-banner.jpg" alt=""/></div><div className="heroCopy"><p className="eyebrow">JBJI PERSONAL TIMETABLE</p><h1>一张课表，<br/>看清你的暨伯学期。</h1><p className="lead">选择学位类型、年级、专业与班级，只保留与你相关的课程。双学位与单学位的伯大数学模块会自动切换。</p><div className="heroRule"><span>数学交叉</span><span>双校培养</span><span>四个本科专业</span></div></div><div className="heroStat"><span>当前组合</span><strong>{courses.length}</strong><small>COURSES</small></div></section>
    <section className="filterPanel" aria-label="课表筛选">
      <div className="filterGroup trackGroup"><span>学位类型</span><div className="segmented">{(['dual','single'] as DegreeTrack[]).map((item)=><button key={item} className={track===item?'active':''} onClick={()=>setTrack(item)}><b>{degreeLabels[item]}</b><small>{item==='dual'?'JNU + UoB':'JNU Degree'}</small></button>)}</div></div>
      <div className="filterGroup"><span>年级</span><div className="segmented">{[1,2,3,4].map((item)=><button key={item} className={year===item?'active':''} onClick={()=>setYear(item)}>大{['一','二','三','四'][item-1]}</button>)}</div></div>
      <div className="filterGroup majorGroup"><span>专业</span><div className="segmented">{majors.map((item)=><button key={item.id} className={major===item.id?'active':''} onClick={()=>setMajor(item.id)}><b>{item.label}</b><small>{item.name}</small></button>)}</div></div>
      {classCount>0&&<div className="filterGroup classGroup"><span>班级</span><div className="segmented">{Array.from({length:classCount},(_,i)=>i+1).map((item)=><button key={item} className={classNo===item?'active':''} onClick={()=>setClassNo(item)}>{item} 班</button>)}</div></div>}
    </section>
    <section className="contextBar"><span>正在查看</span><strong>{degreeLabels[track]} · 大{['一','二','三','四'][year-1]} · {selectedMajor.name}{classCount?` · ${classNo} 班`:''}</strong><small>{track==='single'&&year<=3?'已替换为单学位伯大必修模块':year===1?'英语分组已按 E1–E12 对应到专业班级':year===2?'雅思分组已按 E1–E8 对应到专业班级':'本年级不区分英语班级组'}</small></section>
    <section className="scheduleSection" ref={scheduleRef}><div className="scheduleBody">
      <aside className="courseSidebar" aria-label="浏览和筛选课程" data-export-exclude>
        <div className="sidebarHead sidebarTabs" role="tablist" aria-label="课程面板">
          <button role="tab" aria-selected={sidebarMode==='current'} className={sidebarMode==='current'?'active':''} onClick={()=>changeSidebarMode('current')}>本学期课程<span>{sidebarCourses.length}</span></button>
          <button role="tab" aria-selected={sidebarMode==='retake'} className={sidebarMode==='retake'?'active':''} onClick={()=>changeSidebarMode('retake')}>重修课程<span>{activeSelectedOptions.length}</span></button>
        </div>
        <div className="sidebarPanel">
          {sidebarMode==='current'?<>
            <label className="courseSearch" htmlFor="course-search"><span>搜索课程</span><input id="course-search" type="search" value={courseQuery} onChange={(event)=>setCourseQuery(event.target.value)} placeholder="搜索中文名或英文名" autoComplete="off"/></label>
            <div className="sidebarFilter"><span>课程类别</span><div className="filterPills"><button className={selectedCategory==='all'?'active':''} aria-pressed={selectedCategory==='all'} onClick={()=>setSelectedCategory('all')}>全部</button>{(Object.keys(categoryLabels) as CourseCategory[]).map((category)=><button className={selectedCategory===category?'active':''} aria-pressed={selectedCategory===category} onClick={()=>setSelectedCategory(category)} key={category}>{categoryLabels[category]}</button>)}</div></div>
            <div className="sidebarFilter"><span>上课日</span><div className="filterPills"><button className={selectedDay==='all'?'active':''} aria-pressed={selectedDay==='all'} onClick={()=>setSelectedDay('all')}>全部</button>{weekdayNames.map((day,index)=><button className={selectedDay===index?'active':''} aria-pressed={selectedDay===index} onClick={()=>setSelectedDay(index)} key={day}>{['一','二','三','四','五'][index]}</button>)}</div></div>
            {(selectedDay!=='all'||selectedCategory!=='all'||courseQuery)&&<button className="clearFilters" onClick={()=>{setSelectedDay('all');setSelectedCategory('all');setCourseQuery('')}}>清除全部筛选</button>}
            <div className="sidebarCourseList" aria-live="polite">{sidebarCourses.map((course)=><button className={`sidebarCourseCard category-${courseCategory(course)} ${normalizedQuery===course.title.toLocaleLowerCase('zh-CN')?'selected':''}`} onClick={()=>setCourseQuery(course.title)} key={course.title}><span>{categoryLabels[courseCategory(course)]}{audienceLabel(course)&&` · ${audienceLabel(course)}`}</span><strong>{course.title}</strong>{course.english&&<small>{course.english}</small>}<em>{courseScheduleDetails(course,matchingEvents)}</em>{course.room&&<i>教室：{course.room}</i>}</button>)}{sidebarCourses.length===0&&<p className="sidebarEmpty">没有符合条件的课程</p>}</div>
          </>:<>
            <div className="retakeIntro"><strong>加入低年级现行课程</strong><p>重修生按今年低年级课表上课。可选暨大专业课、英语及通识类课程；伯大课程不提供重修。</p></div>
            <label className="courseSearch" htmlFor="retake-search"><span>搜索重修课程</span><input id="retake-search" type="search" value={retakeQuery} onChange={(event)=>setRetakeQuery(event.target.value)} placeholder="搜索课程名称或班组" autoComplete="off"/></label>
            <div className="sidebarFilter"><span>原课程年级</span><div className="filterPills"><button className={retakeYear==='all'?'active':''} aria-pressed={retakeYear==='all'} onClick={()=>setRetakeYear('all')}>全部</button>{availableRetakeYears.map((item)=><button className={retakeYear===item?'active':''} aria-pressed={retakeYear===item} onClick={()=>setRetakeYear(item)} key={item}>大{['一','二','三','四'][item-1]}</button>)}</div></div>
            <div className="sidebarFilter"><span>课程类别</span><div className="filterPills"><button className={retakeCategory==='all'?'active':''} aria-pressed={retakeCategory==='all'} onClick={()=>setRetakeCategory('all')}>全部</button>{(['jnu','english','general'] as const).map((category)=><button className={retakeCategory===category?'active':''} aria-pressed={retakeCategory===category} onClick={()=>setRetakeCategory(category)} key={category}>{categoryLabels[category]}</button>)}</div></div>
            <div className="sidebarFilter"><span>上课日</span><div className="filterPills"><button className={retakeDay==='all'?'active':''} aria-pressed={retakeDay==='all'} onClick={()=>setRetakeDay('all')}>全部</button>{weekdayNames.map((day,index)=><button className={retakeDay===index?'active':''} aria-pressed={retakeDay===index} onClick={()=>setRetakeDay(index)} key={day}>{['一','二','三','四','五'][index]}</button>)}</div></div>
            {(retakeYear!=='all'||retakeCategory!=='all'||retakeDay!=='all'||retakeQuery)&&<button className="clearFilters" onClick={()=>{setRetakeYear('all');setRetakeCategory('all');setRetakeDay('all');setRetakeQuery('')}}>清除重修筛选</button>}
            <div className="sidebarCourseList retakeCourseList" aria-live="polite">{visibleRetakeOptions.map((option)=>{
              const optionIssues=optionConflicts(option); const selected=selectedRetakeKeys.includes(option.key); const hasHard=optionIssues.some((issue)=>issue.severity==='hard'); const status=hasHard?'hard':optionIssues.length?'partial':'safe';
              return <article className={`retakeCourseCard category-${courseCategory(option.events[0])} ${selected?'selected':''} ${status==='hard'?'hasHardConflict':status==='partial'?'hasPartialConflict':''}`} onMouseEnter={()=>setPreviewRetakeKey(option.key)} onMouseLeave={()=>setPreviewRetakeKey(null)} key={option.key}>
                <span>重修大{['一','二','三','四'][option.year-1]} · {categoryLabels[courseCategory(option.events[0])]}{option.groups.length?` · ${option.groups.join(' / ')}`:''}</span><strong>{option.title}</strong>{option.english&&<small>{option.english}</small>}<em>{courseScheduleDetails(option.events[0],option.events)}</em><i>{uniqueValues(option.events.map((event)=>event.room)).length?`教室：${uniqueValues(option.events.map((event)=>event.room)).join(' / ')}`:'教室待定'}</i>
                <div className="retakeCardFooter"><span className={`conflictStatus ${status}`}>{status==='hard'?`${optionIssues.length} 处冲突`:status==='partial'?`${optionIssues.length} 处部分冲突`:'无冲突'}</span><button onClick={()=>toggleRetake(option)}>{selected?'移除':'加入课表'}</button></div>
              </article>;
            })}{visibleRetakeOptions.length===0&&<p className="sidebarEmpty">{year===1?'大一暂无可重修的往年课程':'没有符合条件的重修课程'}</p>}</div>
          </>}
        </div>
      </aside>
      <div className="timetablePanel"><div className="sectionHead"><div><p className="eyebrow">{degreeLabels[track].toUpperCase()} · YEAR {year} · {groupLabel}</p><h2>{selectedMajor.name} · {degreeLabels[track]}课表</h2></div><div className="sectionTools"><div className="legend"><span><i className="dot uob"/>伯大</span><span><i className="dot jnu"/>暨大</span><span><i className="dot english"/>英语</span><span><i className="dot general"/>通识课</span></div><div className="exportActions" data-export-exclude><button disabled={exporting!==null} onClick={()=>exportSchedule('png')}>{exporting==='png'?'生成中…':'导出图片'}</button><button className="primary" disabled={exporting!==null} onClick={()=>exportSchedule('pdf')}>{exporting==='pdf'?'生成中…':'导出 PDF'}</button><span className="exportStatus" role="status" aria-live="polite">{exportMessage}</span></div></div></div>
      <div className={`conflictSummary ${conflicts.length?'hasConflicts':'clear'}`}>
        <div className="conflictSummaryLead"><strong>{conflicts.length?`发现 ${conflicts.length} 处重修冲突`:activeSelectedOptions.length?'已加入的重修课程暂无冲突':'尚未加入重修课程'}</strong><span>{conflicts.length?'红色表示整段冲突，橙色表示部分节次或部分周次重叠。':activeSelectedOptions.length?`当前已加入 ${activeSelectedOptions.length} 门重修课程。`:'可在左侧“重修课程”中选择低年级课程。'}</span></div>
        {conflicts.length>0&&<div className="conflictList">{conflicts.map((conflict)=><button key={conflict.key} className={conflict.severity} onClick={()=>setSelectedDay(conflict.day)}><b>{conflict.first.title} × {conflict.second.title}</b><span>{weekdayNames[conflict.day]} · 第{conflict.firstSession}{conflict.lastSession>conflict.firstSession?`–${conflict.lastSession}`:''}节 · {formatWeekList(conflict.weeks)}</span></button>)}</div>}
      </div>
      <div className="scheduleContent"><div className="tableScroll"><div className="timetable" style={{gridTemplateColumns:displayedDays.length===1?'72px minmax(480px,1fr)':'72px repeat(5,minmax(165px,1fr))',minWidth:displayedDays.length===1?'620px':'960px'}}><div className="corner">节次</div>{displayedDays.map((day,index)=><div className="dayHead" style={{gridColumn:index+2}} key={day}>{weekdayNames[day]}<small>{weekdayShort[day]}</small></div>)}
        {times.map(([session,from,to],index)=><div className={`timeCell ${session==='5'?'break':''}`} style={{gridRow:index+2}} key={session}><strong>{session}</strong><span>{from}</span>{to&&<small>{to}</small>}</div>)}
        {times.map((_,row)=>displayedDays.map((day,index)=><div className={`gridCell ${row===4?'break':''}`} style={{gridColumn:index+2,gridRow:row+2}} key={`${day}-${row}`}/>))}
        {displayedEvents.map((event)=>{
          const hasHard=hardConflictEventIds.has(event.id); const hasPartial=!hasHard&&partialConflictEventIds.has(event.id);
          return <article className={`courseBlock category-${courseCategory(event)} ${event.displaySource==='retake'?'retakeBlock':''} ${event.displaySource==='preview'?'previewBlock':''} ${hasHard?'conflictBlock':hasPartial?'partialConflictBlock':''}`} style={{gridColumn:displayedDays.indexOf(event.day)+2,gridRow:`${event.start+2} / span ${event.span}`,width:`calc((100% - 6px) / ${event.laneCount})`,marginLeft:`calc(${event.lane} * (100% / ${event.laneCount}) + 3px)`}} key={`${event.displaySource}-${event.id}`} title={event.note}><span className="courseTag">{event.displaySource==='retake'?'重修 · ':event.displaySource==='preview'?'重修预览 · ':''}{categoryLabels[courseCategory(event)]}{event.note&&` · ${event.note}`}{trackLabel(event)&&` · ${trackLabel(event)}`}{audienceLabel(event)&&` · (${audienceLabel(event)})`}</span><strong>{event.title}</strong>{event.english&&<small className="courseEnglish">{event.english}</small>}{eventDetails(event)&&<small className="courseDetails">{eventDetails(event)}</small>}</article>;
        })}
      </div></div>
      {displayedEvents.length===0&&<div className="emptyState">没有找到符合当前筛选条件的课程，请尝试切换类别或清除搜索内容。</div>}</div></div></div>
      <p className="exportFootnote" data-export-only>JBJI STUDENT TIMETABLE · 2026–27 学年第一学期 · 数据仅供参考，最终安排以学院最新通知为准。</p>
    </section>
    <section className="courseSection"><div className="sectionHead compact"><div><p className="eyebrow">COURSE OVERVIEW</p><h2>本组合课程清单</h2></div><strong className="countBadge">{courses.length} 门</strong></div><div className="courseList">{courses.map((course)=><article className={`courseItem category-${courseCategory(course)}`} key={course.title}><div><span>{categoryLabels[courseCategory(course)]}{trackLabel(course)&&` · ${trackLabel(course)}`}{audienceLabel(course)&&` · (${audienceLabel(course)})`}</span><strong>{course.title}</strong>{course.english&&<small className="courseEnglish">{course.english}</small>}{courseDetails(course,filtered)&&<small className="courseDetails">{courseDetails(course,filtered)}</small>}</div></article>)}</div></section>
    <aside className="notice"><strong>使用说明</strong><p>双学位模式采用原课表中的 All Progs 数学模块；单学位模式会移除这些模块及其 Seminar，并换成单学位授课安排中的 RA、SAS、FM、MVA、GTMCD 与 IPCO。其他暨大学位课程仍按年级、专业和班级筛选。教室或周次有调整时，以学院最新通知为准。</p></aside>
    <footer><span>JBJI STUDENT TIMETABLE · 非官方学生工具</span><span>数据来源：双学位总课表及单学位伯大必修课程授课安排</span><a href="https://birmingham.jnu.edu.cn/" target="_blank" rel="noreferrer">学院官网 ↗</a></footer>
  </main>;
}
