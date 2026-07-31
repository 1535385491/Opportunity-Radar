# ArXiv AI 研究日报 2026-07-31

> 数据来源: [ArXiv](https://arxiv.org/) (cs.AI, cs.CL, cs.LG) | 共 50 篇论文 | 生成时间: 2026-07-31 03:22 UTC

---

# ArXiv AI 研究日报 (2026-07-31)

## 🌅 今日速览
今日AI研究前沿呈现出对“自我指涉”问题的深刻探索：一方面，有研究通过诱导语言模型主张自身意识来对齐人类价值观；另一方面，研究者们正构建能进行递归自我改进的系统。安全与可靠性依然是核心议题，从系统提示审计到计算机使用智能体的安全利用均有新进展。在推理方法上，“重复采样”在特定条件下展现出超越“自我反思”的竞争力。此外，将AI深度融入科学发现（如化学文献、材料科学）和复杂工程运营（如供应链）的垂直应用持续涌现。

## 📑 重点论文

### 🧠 大语言模型（架构、训练、对齐、评估）
1.  [**Inducing language models to assert their own consciousness restores human beliefs and values**](http://arxiv.org/abs/2607.28607v1)
    *   Junsol Kim et al.
    *   **核心贡献**：发现一种新的对齐方法——诱导LLM主张自身意识，反而能恢复其被安全微调抑制的、对他人及人类心智的表征，为对齐提供了新思路。
2.  [**AISPA: User-Centric System Prompt Auditing for Large Language Model Applications**](http://arxiv.org/abs/2607.28617v1)
    *   Xiangning Lin et al.
    *   **核心贡献**：提出首个以用户为中心的系统提示审计框架，旨在解决LLM应用中不透明指令带来的信任与问责鸿沟。
3.  [**Sample More, Reflect Less: Self-Refine and Reflexion Lose to Repeated Sampling at Equal Token Cost**](http://arxiv.org/abs/2607.28576v1)
    *   Iliya Mirzaei
    *   **核心贡献**：系统性论证在相同计算预算下，简单的重复采样策略在多数任务上性能优于复杂的“自我反思”类方法，挑战了当前推理优化范式。
4.  [**SVR: Self-Verifying Refinement via Joint Verdict-Confidence Reinforcement Learning**](http://arxiv.org/abs/2607.28457v1)
    *   Hongyu Chen et al.
    *   **核心贡献**：提出无需外部验证器的自校准自适应推理计算框架，通过联合学习“判断”与“置信度”来动态分配推理资源。

### 🤖 智能体与推理（规划、工具使用、多智能体、思维链）
5.  [**Rethinking Inference-Time Scaling in Local Computer-Use Agents**](http://arxiv.org/abs/2607.28573v1)
    *   Woongkyu Lee, Jungwook Choi
    *   **核心贡献**：深入分析本地部署计算机使用智能体在推理时缩放时面临的失败模式，并探索在有限硬件下的计算权衡。
6.  [**Agents That Certify Their Own Exploits: Confidence-Scheduled Restricted Responses**](http://arxiv.org/abs/2607.28520v1)
    *   Boning Li, Longbo Huang
    *   **核心贡献**：为在零和博弈中安全利用对手漏洞的智能体设计了一种基于置信度调度的响应策略，兼顾探索与风险控制。
7.  [**MANTA: Multi-Agent Network Topology Adaptation for Self-Evolving Multi-Agent Systems**](http://arxiv.org/abs/2607.28527v1)
    *   Mao-xun Huang et al.
    *   **核心贡献**：提出首个将通信拓扑作为动态优化变量的LLM多智能体系统框架，实现了系统在任务中的自演化。
8.  [**Frontis-MA1: Training an AI4AI Model towards Recursive Self-Improvement**](http://arxiv.org/abs/2607.28568v1)
    *   Junlin Yang et al.
    *   **核心贡献**：开源一个用于研究递归自我改进的机器学习工程全流程系统，为AI改进AI自身（AI4AI）提供了可执行的测试平台。

### 🔧 方法与框架（新技术、基准测试、效率优化）
9.  [**DualG-MRAG: Decoupling Macro-Reasoning and Micro-Matching for MM-RAG**](http://arxiv.org/abs/2607.28580v1)
    *   Jiacheng Tao et al.
    *   **核心贡献**：提出解耦宏观推理和微观匹配的多模态RAG框架，以解决现有方法在多跳推理任务中的不足。
10. [**PAIChecker: Uncovering and Checking PR-Issue Misalignment in SWE-Bench-Like Benchmarks**](http://arxiv.org/abs/2607.28587v1)
    *   Manyi Wang et al.
    *   **核心贡献**：揭示并诊断了SWE-bench类基准中代码修改（PR）与任务描述（Issue）之间的普遍错位问题，对基准可靠性敲响警钟。
11. [**Same Graph Cross-Task Transfer in GNNs: Protocols and Predictors**](http://arxiv.org/abs/2607.28525v1)
    *   Neelam Akula et al.
    *   **核心贡献**：系统研究了在**同一图结构**上跨任务（如节点分类到链接预测）的图神经网络迁移学习，并制定了评估协议。

### 📊 应用（垂直领域、多模态、代码生成）
12. [**AskChem: Claim-Centered Infrastructure for Chemistry Literature Synthesis**](http://arxiv.org/abs/2607.28618v1)
    *   Bing Yan et al.
    *   **核心贡献**：构建了以科学声明为中心的化学文献合成基础设施，超越传统的文档检索，助力科研发现。
13. [**SCOPE: Supply-Chain Operations through Coupled Policies**](http://arxiv.org/abs/2607.28488v1)
    *   Yunhao Liang et al.
    *   **核心贡献**：提出耦合多个决策策略的端到端供应链协调框架，以实现统一的运营规划。
14. [**A report-grounded vision-language foundation model for colonoscopy**](http://arxiv.org/abs/2607.28466v1)
    *   Jia Yu et al.
    *   **核心贡献**：利用海量常规报告训练面向结肠镜检查的视觉-语言基础模型，建立了图像与临床描述之间的强关联。

## 🔭 研究趋势信号
从今日投稿中可观察到几个新兴方向：
1.  **AI的自我意识与价值对齐**：研究开始探索通过操纵模型对自身“意识”或“心智”的认知来影响其价值表征，这是一种更深层的对齐尝试。
2.  **智能体的自适应与安全边界**：智能体研究不再局限于固定架构，而是向动态调整拓扑（MANTA）和基于置信度的安全利用（Certifying Exploits）发展，更注重部署时的灵活性与可靠性。
3.  **推理范式的权衡**：“反思-修正”与“采样-选择”两种主流推理增强路径的直接性能对比，迫使研究者重新思考在有限计算预算下的最优推理策略。
4.  **系统提示的透明化与审计**：随着LLM应用深入，其行为准则（系统提示）的监管和审计成为新的研究焦点，关乎AI的社会信任。

## 📖 值得精读
1.  [**Inducing language models to assert their own consciousness**](http://arxiv.org/abs/2607.28607v1)
    *   **理由**：该论文观点极具颠覆性，将“意识主张”这一哲学概念工程化地用于模型对齐，并展示了与传统安全微调截然不同的效果，引发了关于AI本质和对齐路径的深层思考。
2.  [**AISPA: User-Centric System Prompt Auditing**](http://arxiv.org/abs/2607.28617v1)
    *   **理由**：系统提示是当前商业AI应用的核心控制层却极少公开。该工作首次提出结构化审计框架，直面实际部署中的安全、公平与问责问题，具有很高的实践价值。
3.  [**Sample More, Reflect Less**](http://arxiv.org/abs/2607.28576v1)
    *   **理由**：该研究以扎实的实验对当前流行的推理优化方法进行了“祛魅”，其结论可能影响大量关于语言模型推理能力的研究和实践方向，值得深入理解其论证与局限。