# Changelog

## [0.0.13](https://github.com/skydroplet/mindcomplete/compare/v0.0.12...v0.0.13) (2025-05-20)

### 🐛 修复

* 标签切换消息混乱 ([14b17d2](https://github.com/skydroplet/mindcomplete/commit/14b17d2b4068b5a431264bd41401acc08d33d492))
* 初始化创建会话显示名称错误 至少保留一个会话 ([d2c2f3c](https://github.com/skydroplet/mindcomplete/commit/d2c2f3c790c026f0b865659cbad9ff6e7dcd2009))
* 兼容响应工具缺少index ([790f276](https://github.com/skydroplet/mindcomplete/commit/790f27647cf89b01c864ce2af9fb93dc3858edf2))

## [0.0.12](https://github.com/skydroplet/mindcomplete/compare/v0.0.11...v0.0.12) (2025-05-18)

### ✨ 新功能

* 支持一次请求多轮工具调用和推理 ([529a7a6](https://github.com/skydroplet/mindcomplete/commit/529a7a6e22efc8700445b2bce483876a17d21de9))
* 格式化展示工具执行结果 ([36976f6](https://github.com/skydroplet/mindcomplete/commit/36976f6fe2f4d33dfeb110e24d5c260342dbeeda))

### 🐛 修复

* 修复新建标签会话无法操作问题 ([0b299e4](https://github.com/skydroplet/mindcomplete/commit/0b299e43713d6cddbb5b9fc82b91f3b04fb864e5))
* 会话名称变更 标签和侧边列表未更新问题 ([7693bed](https://github.com/skydroplet/mindcomplete/commit/7693bed75ca26a0509430a0e90c88ebb1cdbf24d))

## [0.0.11](https://github.com/skydroplet/mindcomplete/compare/v0.0.5...v0.0.11) (2025-05-14)

### ✨ 新功能

* 增加版本说明自动化创建 ([cf0c7d5](https://github.com/skydroplet/mindcomplete/commit/cf0c7d52bc0a27fd13af59927c13261374fe9ee6))

### 🐛 修复

* 一次对话结束后清理数据失败 ([4404e88](https://github.com/skydroplet/mindcomplete/commit/4404e883a74253d5f95eef5f279b529a48df4a02))

## [0.0.5](https://github.com/skydroplet/mindcomplete/compare/v0.0.1...v0.0.5) (2025-05-12)

### 🐛 修复

* 代码高度冗余定义 输入框字体大小调整 ([53a734e](https://github.com/skydroplet/mindcomplete/commit/53a734e772191425e31560de1f55ec6786ef29c6))
* 修复发送消息按钮混乱问题 ([0fd696a](https://github.com/skydroplet/mindcomplete/commit/0fd696a0a41909bc26937473e1827b774a14700d))
* MCP服务更新失败 ([569082f](https://github.com/skydroplet/mindcomplete/commit/569082f88c9222f831558d82d7ccb83790717ace))

### ✨ 新功能

* 导出配置支持选择指定配置 ([0654957](https://github.com/skydroplet/mindcomplete/commit/0654957956a6d2e74569a02a983b317fdf3ef0f3))
* 列表样式优化 ([6480aa7](https://github.com/skydroplet/mindcomplete/commit/6480aa7a67d01e3ba5bf6a2017a104699959f1d3))
* 配置到处支持区分敏感信息 ([5208fa9](https://github.com/skydroplet/mindcomplete/commit/5208fa90a910f14e8916741f4973cba7b6922ee1))
* 统一滑动条样式 ([4760590](https://github.com/skydroplet/mindcomplete/commit/4760590d02e3b295b0fb779ff3d77767e46ada2e))
* 统一配置窗口滚动条样式 ([773a80b](https://github.com/skydroplet/mindcomplete/commit/773a80b53b9d3bdfbd4ded541f38311d648b2e03))
* 优化导出项展开折叠逻辑 ([15667ec](https://github.com/skydroplet/mindcomplete/commit/15667ec5dcc5e967937ec89491c4049eeaf3d461))
* 增加版本说明自动化创建 ([fb8588e](https://github.com/skydroplet/mindcomplete/commit/fb8588ecfc1475322e1bc73332da39b33134b693))
* 增加配置导出功能 ([1139a11](https://github.com/skydroplet/mindcomplete/commit/1139a11e51fe28ed0e9a275cd6b9e87c8784835b))
* 增加请求响应ID 避免不同的消息之间互相影响 ([09ffd1e](https://github.com/skydroplet/mindcomplete/commit/09ffd1e13a511fa6ccff7bf6b98aef0292b3f938))
* 增加推理模型思考过程展示 ([8065ae2](https://github.com/skydroplet/mindcomplete/commit/8065ae22382f9aa434693447449c4d53f8f774a5))
* 支持多个url检查更新 ([8f013f8](https://github.com/skydroplet/mindcomplete/commit/8f013f8da085128c934102a474155e751a9e1abb))
* 支持AI回复中收到新消息自动中断 ([a6bef59](https://github.com/skydroplet/mindcomplete/commit/a6bef5991c642e2ea9807298da4440d04c65e276))

## [0.0.1]

### ✨ 新功能

* 初始版本，支持大模型流式对话和MCP工具调用
