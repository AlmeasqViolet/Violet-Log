# hugo-reimu-template

<img alt="theme version" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FD-Sketon%2Fhugo-theme-reimu%2Frefs%2Fheads%2Fmain%2Fpackage.json&query=%24.version&label=theme">

Template for [hugo-theme-reimu](https://github.com/D-Sketon/hugo-theme-reimu)

## Usage

```bash
git clone https://github.com/D-Sketon/hugo-reimu-template --recursive
cd hugo-reimu-template
hugo serve
```

## How to use

- Change your site configuration in `hugo.toml`
- Change your theme configuration in `config/_default/params.yml`
- Change your post cover in `data/covers.yml`
- Change your avatar in `static/avatar/avatar.webp`
- Add your posts in `content/post`

## 站内搜索（本地索引，非 Algolia）

搜索完全在浏览器里完成，不依赖 Algolia，也没有额外的构建步骤：

- 索引就是 Hugo 原生的 `algolia.json` 输出（每篇文章的标题 + 正文纯文本，
  由 `[outputFormats.Algolia]` 生成），首次搜索时 `fetch` 一次（约 40 KB）
- `assets/js/algolia_search.ts` 覆盖了主题同名文件，用子串匹配 + 标题加权打分，
  中文不需要分词，输入「镜像」「配置」这类词可以直接命中
- `config/_default/params.yml` 里的 `algolia_search.enable` 只负责打开弹层、
  头部搜索按钮和样式（主题靠这个开关渲染这些部分）；`appID/apiKey/indexName`
  留空即可，不要填

### 主题覆盖文件

| 文件 | 作用 |
| --- | --- |
| `assets/js/algolia_search.ts` | 用本地索引替换 Algolia 客户端 |
| `layouts/partials/helpers/cdnJs.html` | 跳过 `algolia`、`instantsearch` 两个 CDN 脚本 |
| `layouts/_default/terms.html` | 标签/分类总览：按篇数排序、字号权重、显示计数 |
| `layouts/partials/widget/tagcloud.html` | 侧边栏标签云：修正权重计算、显示计数 |
| `layouts/partials/header.html` | RSS 图标回退：没有独立 feed 的页面链接到站点主 feed |
| `layouts/partials/archives.html` | 归档页标签胶囊后显示每个标签的文章数 |
| `layouts/partials/sidebar/commonBar.html` | 侧边栏：桌面端去掉 Home/Archives/About 菜单（手机端保留，否则无法导航） |

主题是 submodule，升级后（`git submodule update --remote`）需要检查上面这些
文件是否仍与新版主题兼容。
