import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={
  metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL||'https://jbji-personal-timetable.ruby-ibis-8269.chatgpt.site'),
  title:'JBJI 本科专属课表 · 2026–27 第一学期',
  description:'按年级、专业与班级筛选 MAM、ICS、Econ、Stat 本科课程。',
  openGraph:{title:'JBJI 本科专属课表',description:'按年级与专业，一眼看清本学期课程。',images:[{url:'/og.png',width:1200,height:630}]},
  twitter:{card:'summary_large_image',title:'JBJI 本科专属课表',description:'按年级与专业，一眼看清本学期课程。',images:['/og.png']},
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}
