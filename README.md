# JBJI Course Assistant

面向 JBJI 本科生的课表筛选页面。可以按双学位/单学位、年级、专业和班级查看专属课程，数据来自 2026–27 学年第一学期课表与单学位伯大必修课程授课安排。

在线访问：<https://miraeina.github.io/jbji-course-assistant/>

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

构建结果位于 `dist/`，是完全静态的 HTML、CSS 和 JavaScript，可以部署到 GitHub Pages 或其他静态托管服务。

## GitHub Pages

仓库包含自动部署工作流。首次发布时，在仓库的 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。以后每次推送到 `main` 分支都会自动更新网站。

## 数据说明

当前课程数据维护在 `app/timetable-data.ts`。带有 `track: 'dual'` 或 `track: 'single'` 的课程只在对应学位类型下显示；未标记的暨大学位课程由两类学生共用。学校发布新课表后，只需更新这个文件并推送即可。

## 开源许可

代码以 MIT License 开源。课程与教务信息仅供查阅，最终安排以学院通知为准。

`public/jbji-logo.png` 与 `public/jbji-banner.jpg` 来源于[暨南大学伯明翰大学联合学院官网](https://birmingham.jnu.edu.cn/)，相关校徽、名称与图片权利归暨南大学、伯明翰大学及学院所有，不包含在本项目的 MIT 软件许可中。本项目为非官方学生工具。
