'use client';

import { useEffect, useMemo, useState } from 'react';
import { majors, timetableEvents, times, type Major, type TimetableEvent } from './timetable-data';

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

const kindLabels={common:'公共课程',shared:'专业共享',major:'专业课程',optional:'选修课程'};

export default function Home(){
  const [year,setYear]=useState(1); const [major,setMajor]=useState<Major>('MAM'); const [classNo,setClassNo]=useState(1);
  const selectedMajor=majors.find((item)=>item.id===major)!;
  const classCount=year===1?3:year===2?2:0;
  useEffect(()=>{if(classCount&&classNo>classCount)setClassNo(1)},[classCount,classNo]);
  const filtered=useMemo(()=>timetableEvents.filter((event)=>{
    if(event.year!==year)return false;
    if(event.majors!=='all'&&!event.majors.includes(major))return false;
    if(event.groups&&classCount&&!event.groups.includes(`${major}${classNo}`))return false;
    return true;
  }),[year,major,classNo,classCount]);
  const events=useMemo(()=>arrange(filtered),[filtered]);
  const courses=useMemo(()=>Array.from(new Map(filtered.map((event)=>[event.title,event])).values()).sort((a,b)=>a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title,'zh-CN')),[filtered]);
  const groupLabel=classCount?`${major}${classNo}`:major;

  return <main>
    <header className="topbar"><a className="brand" href="#top"><span className="brandMark">J</span><span><strong>JBJI 课表</strong><small>2026–27 学年 · 第一学期</small></span></a><span className="sourceBadge">资料日期：2026-08-24 · 5 页总表</span></header>
    <section className="hero" id="top"><div><p className="eyebrow">PERSONAL TIMETABLE</p><h1>从混排总表，到你的专属课表。</h1><p className="lead">选择年级、专业与班级，只保留与你相关的课程。公共课、专业共享课和英语分组会自动归入同一张表。</p></div><div className="heroStat"><strong>{courses.length}</strong><span>当前课程</span></div></section>
    <section className="filterPanel" aria-label="课表筛选">
      <div className="filterGroup"><span>年级</span><div className="segmented">{[1,2,3,4].map((item)=><button key={item} className={year===item?'active':''} onClick={()=>setYear(item)}>大{['一','二','三','四'][item-1]}</button>)}</div></div>
      <div className="filterGroup majorGroup"><span>专业</span><div className="segmented">{majors.map((item)=><button key={item.id} className={major===item.id?'active':''} onClick={()=>setMajor(item.id)}><b>{item.label}</b><small>{item.name}</small></button>)}</div></div>
      {classCount>0&&<div className="filterGroup classGroup"><span>班级</span><div className="segmented">{Array.from({length:classCount},(_,i)=>i+1).map((item)=><button key={item} className={classNo===item?'active':''} onClick={()=>setClassNo(item)}>{item} 班</button>)}</div></div>}
    </section>
    <section className="contextBar"><span>正在查看</span><strong>大{['一','二','三','四'][year-1]} · {selectedMajor.name}{classCount?` · ${classNo} 班`:''}</strong><small>{year===1?'英语分组已按 E1–E12 对应到专业班级':year===2?'雅思分组已按 E1–E8 对应到专业班级':'本年级不区分英语班级组'}</small></section>
    <section className="scheduleSection"><div className="sectionHead"><div><p className="eyebrow">YEAR {year} · {groupLabel}</p><h2>{selectedMajor.name}专属课表</h2></div><div className="legend"><span><i className="dot common"/>公共课程</span><span><i className="dot shared"/>专业共享</span><span><i className="dot own"/>专业课程</span><span><i className="dot optional"/>选修课程</span></div></div>
      <div className="tableScroll"><div className="timetable"><div className="corner">节次</div>{['周一','周二','周三','周四','周五'].map((day,index)=><div className="dayHead" style={{gridColumn:index+2}} key={day}>{day}<small>{['MON','TUE','WED','THU','FRI'][index]}</small></div>)}
        {times.map(([session,from,to],index)=><div className={`timeCell ${session==='5'?'break':''}`} style={{gridRow:index+2}} key={session}><strong>{session}</strong><span>{from}</span>{to&&<small>{to}</small>}</div>)}
        {times.map((_,row)=>[0,1,2,3,4].map((day)=><div className={`gridCell ${row===4?'break':''}`} style={{gridColumn:day+2,gridRow:row+2}} key={`${day}-${row}`}/>))}
        {events.map((event)=><article className={`courseBlock tone-${event.kind}`} style={{gridColumn:event.day+2,gridRow:`${event.start+2} / span ${event.span}`,width:`calc((100% - 6px) / ${event.laneCount})`,marginLeft:`calc(${event.lane} * (100% / ${event.laneCount}) + 3px)`}} key={event.id} title={event.note}><span className="courseTag">{event.note||kindLabels[event.kind]}</span><strong>{event.title}</strong>{event.english&&<small>{event.english}</small>}<em>{event.room||'地点待通知'}{event.weeks?` · ${event.weeks}`:''}</em></article>)}
      </div></div>
      {events.length===0&&<div className="emptyState">当前组合暂未录入课程，请核对年级与专业。</div>}
    </section>
    <section className="courseSection"><div className="sectionHead compact"><div><p className="eyebrow">COURSE OVERVIEW</p><h2>本组合课程清单</h2></div><strong className="countBadge">{courses.length} 门</strong></div><div className="courseList">{courses.map((course)=><article className={`courseItem tone-${course.kind}`} key={course.title}><div><span>{kindLabels[course.kind]}</span><strong>{course.title}</strong>{course.english&&<small>{course.english}</small>}</div><div className="courseMeta">{course.weeks&&<b>{course.weeks}</b>}{course.note&&<em>{course.note}</em>}</div></article>)}</div></section>
    <aside className="notice"><strong>使用说明</strong><p>本页依据原始 PDF 课表整理，已将 All Progs、MAM/ICS、Econ/Stat 以及单专业课程重新归类。标为“选修”的课程可能需要在同一时段内择一；教室或周次有调整时，以学院最新通知为准。</p></aside>
    <footer>非官方课表工具 · 数据来源：26-27-1-JBJI-Timetable.pdf · 课程安排请以学院最新通知为准</footer>
  </main>;
}
