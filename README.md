# 概述

心至(mindcomplete) 是一个简单、自由的跨平台大模型客户端应用，支持大模块流式对话和MCP调用。围绕一切皆是工具的方向进行设计，包括心至应用本身，让所有的工具都能够通过对话的方式调用，不需要再关注复杂的配置、参数。目标是让每个人都能自由地和数字世界进行交互。

![应用截图](./assets/mindcomplete-example.png)

# 为什么要做

移动互联网时代，各大公司把互联网封闭在了一个又一个APP中，使其变得支离破碎，我们需要不断地在不同的APP之间切换，要忍受广告，被算法封闭，付出大量精力获取内容。本质就是个人和企业在对抗过程中，时间、技术的差距无法弥补。大模型和MCP的出现，可以在一定程度上实现时间、技术平等，通过大模型调用MCP能够让我们更加智能、高效地地使用互联网，让互联网有希望重新变得自由。也许这些大型公司又会通过各种技术手段进行封闭，但至少现在我们可以通过MCP打通一个又一个分裂的围栏，通过大模型帮我们进行汇总和分析，获取更高质量的内容。

# 功能介绍

## 已发布

* 大模型对话
  * 支持OpenAI兼容接口
  * 支持大模型流式会话
  * 支持对话内容Markdown格式渲染，代码渲染
* MCP调用
  * 支持本地MCP服务调用
  * 支持MCP工具调用授权
* 会话
  * 支持会话历史记录
  * 支持对话窗口标签
* 配置管理
  * 模型、提示词、MCP服务配置添加、修改、删除、复制
  * MCP服务测试、工具授权管理
  * 支持导入导出
* 外观
  * 深色/浅色模式

## 开发中…

* [ ] 支持多系统打包、安装、部署
* [ ] 支持安装时同步安装MCP运行环境
* [ ] 安装时内置一些有用的MCP
* [ ] 支持Agent配置和对话
* [ ] 支持Agent Team配置和对话
* [ ] 支持配置管理作为MCP服务
* [ ] 支持MCP提示词、资源
* [ ] 支持开放端口访问
* [ ] 直接进行MCP调用

# 安装和运行

```bash
git clone https://github.com/skydroplet/mindcomplete.git
cd mindcomplete

# 安装依赖
npm install

# 运行
npm start
```

# 开发环境

Node js：v22.14.0

# 联系方式

- 邮箱：skydroplet@qq.com
- GitHub：[skydroplet](https://github.com/skydroplet)
- 项目主页：[MindComplete](https://github.com/skydroplet/mindcomplete)

# 许可证

本项目采用 GPL-3.0 许可证 - 详见 [LICENSE](LICENSE) 文件

# 贡献

欢迎提交 Issue 和 Pull Request！
