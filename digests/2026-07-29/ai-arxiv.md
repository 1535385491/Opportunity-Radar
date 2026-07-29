# ArXiv AI 研究日报 2026-07-29

> 数据来源: [ArXiv](https://arxiv.org/) (cs.AI, cs.CL, cs.LG) | 共 50 篇论文 | 生成时间: 2026-07-29 02:55 UTC

---

## ArXiv AI 研究日报  
**日期**：2026年7月29日（来源：arXiv.org cs.AI/cs.CL/cs.LG 等）

---

### 📌 今日速览  
今日研究显著聚焦于 **LLM 的效率与智能体安全**：在模型侧，通过动态路由（MoE-LoRA）、记忆管理（UniMem/MemLens）与硬件协同设计（MDTransformer）提升推理效率与实用性；在智能体侧，跨供应商信任管理、GUI 任务评估及多模态诊断推理等研究，凸显了从“能用”到“可靠、安全、可解释”的工程化需求；此外，多模态大模型与机器人策略学习（πR²、SAM3D-VLA）在实时交互与跨模态融合上取得新进展。

---

### 🔥 重点论文（按主题分类）

#### 🧠 大语言模型（架构、训练、对齐、评估）
1. **[Pass the Baton: Trajectory-Relayed On-Policy Distillation](http://arxiv.org/abs/2607.26057v1)**  
   *Xu et al.*  
   提出“轨迹接力”蒸馏框架，解决 on-policy 蒸馏中因学生模型早期错误导致后续生成偏离的“前缀失败”问题，提升知识迁移稳定性。

2. **[Spend Experts Where You Are Unsure: Confidence-Adaptive Routing for MoE LoRA](http://arxiv.org/abs/2607.26052v1)**  
   *Saliencro et al.*  
   根据 token 置信度动态分配专家资源，避免在简单 token 上过度计算，提升 MoE-LoRA 在效率与性能间的平衡。

3. **[Minimizing Targeted Activations: Input-Only Suppression of Evaluation-Awareness Latents](http://arxiv.org/abs/2607.25907v1)**  
   *Mody et al.*  
   通过输入端提示优化，抑制 LLM 内部特定“评估感知”神经元激活，为模型行为控制提供无需推理时干预的新思路。

4. **[Stemma: Induced Decision Regions Reveal LLM Provenance](http://arxiv.org/abs/2607.25880v1)**  
   *Zhang et al.*  
   通过诱导决策区域检测 LLM 血缘关系，为模型溯源、版权验证与适配监控提供新方法。

#### 🤖 智能体与推理（规划、工具使用、安全）
5. **[Desktop-Delta Bench: Do Computer-Use Models Understand GUI Transitions?](http://arxiv.org/abs/2607.26041v1)**  
   *Pillai et al.*  
   提出新基准，评估计算机操作智能体对 GUI 状态转移的因果理解能力，填补了现有评估只关注终态结果的空白。

6. **[Toward Standardized Cross-Vendor Agent Tool Trust Management](http://arxiv.org/abs/2607.25914v1)**  
   *Sharma et al.*  
   针对自治网络提出跨供应商工具信任管理框架，解决多厂商环境中 AI 智能体的安全调用问题。

7. **[Interactive Reward Agent: GUI Task Evaluation via Environment-State Verification](http://arxiv.org/abs/2607.25904v1)**  
   *Shi et al.*  
   通过环境状态验证自动评估 GUI 任务完成情况，为智能体训练提供更可靠、精细的奖励信号。

8. **[Messier: A High-Resolution Corpus for Cross-Benchmark Agent Evaluation](http://arxiv.org/abs/2607.25891v1)**  
   *Krsteski et al.*  
   发布统一高分辨率评测语料库，解决当前智能体评估任务碎片化、不可比的问题。

#### 🔧 方法与框架（效率、多模态、硬件）
9. **[$π\mathbf{R}^2$: Reactive Real-time Flow Policies](http://arxiv.org/abs/2607.26055v1)**  
   *Park & Tulsiani*  
   提出反应式实时流策略，使动作分块执行的机器人操作策略能实时响应执行中的新感知输入，提升闭环控制能力。

10. **[CHARM: Hierarchical Context Modeling for Multimodal Graph Foundation Models](http://arxiv.org/abs/2607.26023v1)**  
    *Yang et al.*  
    提出多模态图基础模型，通过分层上下文建模实现跨图域、跨模态的零样本迁移。

11. **[MODUS: Decoder-Only Any-to-Any Modeling of Diverse Modalities](http://arxiv.org/abs/2607.25948v1)**  
    *Ye et al.*  
    提出统一解码器架构实现任意模态输入到任意模态输出的生成，探索多模态统一建模的高效路径。

12. **[MDTransformer: Hardware-Software Co-Design of Photonic Transformer Accelerator](http://arxiv.org/abs/2607.26016v1)**  
    *Serunjogi et al.*  
    通过模分复用与硬件协同设计，提升光子 Transformer 加速器的效率与成本效益。

13. **[Penelope: Localized Latent Recurrence for Efficient Structured Reasoning](http://arxiv.org/abs/2607.25915v1)**  
    *Chen et al.*  
    在潜在空间引入局部循环机制，为结构化推理提供更高效、可控的计算扩展方式。

#### 📊 应用（医疗、机器人、代码）
14. **[Evaluating Multi-Turn Multimodal Diagnostic Reasoning on Real-World Clinical Cases](http://arxiv.org/abs/2607.25933v1)**  
    *Yang et al.*  
    构建基于真实病例的多轮多模态诊断推理评估体系，更贴近临床实践的动态推理过程。

15. **[Reinforcement Learning for Code Optimization](http://arxiv.org/abs/2607.25970v1)**  
    *Chambon et al.*  
    探索将强化学习用于代码运行时优化，揭示以执行时间作为奖励信号时产生的复杂优化陷阱。

---

### 📈 研究趋势信号  
1. **LLM 记忆与状态管理**：UniMem、MemLens 等研究关注如何让智能体在长序列任务中有效积累、管理与检索记忆，平衡稳定性与可塑性。  
2. **推理效率与专用化**：从动态专家分配（MoE-LoRA）到潜在空间循环（Penelope），再到硬件加速（MDTransformer），提升推理效率和部署友好性成为核心目标。  
3. **智能体安全与治理**：跨厂商信任管理、工具调用验证、评估感知抑制等方向，反映出社区对智能体实际部署中安全、可靠与可控性的高度重视。  
4. **多模态统一与交互**：从多模态图学习（CHARM）到任意模态生成（MODUS），再到机器人策略（πR²、SAM3D-VLA），研究正朝更灵活、更通用的跨模态感知与行动能力迈进。

---

### 📖 值得精读  
1. **[Pass the Baton](http://arxiv.org/abs/2607.26057v1)**  
   *理由*：针对知识蒸馏中一个关键而棘手的“错误累积”问题提出了新颖的解决方案，方法直观且可能广泛适用于序列生成模型的训练。

2. **[Toward Standardized Cross-Vendor Agent Tool Trust Management](http://arxiv.org/abs/2607.25914v1)**  
   *理由*：直面多智能体系统在复杂工业环境中落地的核心安全挑战，提出的框架具有前瞻性和现实意义，对推动自治网络实用化至关重要。

3. **[Interactive Reward Agent](http://arxiv.org/abs/2607.25904v1)**  
   *理由*：为 GUI 智能体评估提供了基于环境状态验证的新范式，其方法可生成更可靠、细粒度的奖励，对智能体训练与测试均有启发。