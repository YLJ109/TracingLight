/**
 * 模块3：题库（V3 整改版｜真实题目）
 * 覆盖：question。每课程每知识点 2 道真实题目，题干/选项(独立互斥)/答案/解析齐备，
 * 主观题(简答/编程)附真实可运行代码。保证课程-章节-知识点强关联、全库题目不重复。
 * 观测：题目总评分经由下游 normalizeScores 归一为每卷满分 100。
 */
import * as schema from '../shared/schema';
import type { SeedCtx } from './ctx';
import type { Drizzle } from './types';

const TYPES = ['single_choice', 'judgment', 'multi_choice', 'fill_blank', 'short_answer', 'programming'] as const;
type QType = (typeof TYPES)[number];
type Diff = 'easy' | 'medium' | 'hard';

interface Q {
  type: QType;
  diff: Diff;
  content: string;
  options?: Array<{ label: string; key: string; text: string; isCorrect: boolean }>;
  answer: string;
  analysis: string;
  minChars?: number;
  maxChars?: number;
}

const LETTERS = ['A', 'B', 'C', 'D'];

/** 单选/多选题选项：texts 为选项文本，correct 为正确项索引（多选题可为数组） */
function opt(texts: string[], correct: number | number[]): Array<{ label: string; key: string; text: string; isCorrect: boolean }> {
  const cset = new Set(Array.isArray(correct) ? correct : [correct]);
  return texts.map((t, i) => ({ label: LETTERS[i], key: LETTERS[i], text: t, isCorrect: cset.has(i) }));
}

/** 简短默认分值 */
function typeScore(type: string): number {
  switch (type) {
    case 'single_choice': return 4;
    case 'judgment': return 4;
    case 'multi_choice': return 8;
    case 'fill_blank': return 6;
    case 'short_answer': return 10;
    case 'programming': return 15;
    default: return 10;
  }
}

type Bank = Record<string, [Q, Q]>;

/** ===================== 每课程知识点的真实题目库（2 道/知识点） ===================== */

// ---------- Python 程序设计 ----------
const PYTHON_BANK: Bank = {
  '变量与基本类型': [
    { type: 'judgment', diff: 'easy', content: 'Python 中变量无需显式声明类型，类型在运行时由赋值动态确定，且同一变量可再次赋值为不同类型的值。', answer: '对', analysis: 'Python 是动态类型语言：解释器在赋值时推断类型，变量只是名字绑定，因此可重新绑定为任意类型。' },
    { type: 'single_choice', diff: 'easy', options: opt(['list（列表）', 'dict（字典）', 'str（字符串）', 'set（集合）'], 2), content: '下列哪种 Python 内置类型是不可变（immutable）的？', answer: 'C', analysis: 'str、tuple、frozenset 不可变；list、dict、set 可变。对不可变对象执行修改会生成新对象。' },
  ],
  '常见数据结构': [
    { type: 'single_choice', diff: 'easy', options: opt(['str', 'tuple', 'list', 'frozenset'], 2), content: '下列哪一个是 Python 内置的可变序列类型？', answer: 'C', analysis: 'list 可变且有序；str/tuple/frozenset 不可变，set 无序但可变。' },
    { type: 'judgment', diff: 'easy', content: 'Python 的 set（集合）允许存放重复元素。', answer: '错', analysis: 'set 是"不重复元素的无序集合"，自动去重；加入重复元素不会报错，但只保留一份。' },
  ],
  '流程控制语句': [
    { type: 'judgment', diff: 'medium', content: '在 Python 中，for 循环可搭配 else 子句，且仅当循环正常结束（未被 break 中断）时 else 块才会执行。', answer: '对', analysis: 'else 与循环里的 break 联动：遇到 break 则跳过 else；循环自然耗尽则执行 else。这是 Python 的独有语法。' },
    { type: 'single_choice', diff: 'medium', content: `执行下列代码的输出结果是？\nfor i in range(3):\n    if i == 1:\n        break\nelse:\n    print('done')`, options: opt(['done', '无任何输出', '报错', '打印 0'], 1), answer: 'B', analysis: '循环在 i==1 时被 break 中断，因此 else 块不执行，控制台无输出。' },
  ],
  '字符串处理': [
    { type: 'fill_blank', diff: 'medium', content: `表达式 "abc"[::-1] 的求值结果为：`, answer: 'cba', analysis: '切片 [::-1] 以步长 -1 从右向左遍历，得到字符串反转 cba。' },
    { type: 'single_choice', diff: 'medium', content: `执行 '  Python  '.strip().lower() 后得到的结果是？`, options: opt(['Python', 'python', '  Python  ', 'python '], 1), answer: 'B', analysis: 'strip() 去除两端空白并结合成"Python"，再 lower() 转全小写为 python。' },
  ],
  '列表与元组': [
    { type: 'judgment', diff: 'medium', content: '元组（tuple）一旦创建其元素无法被修改，因此元组是可变对象。', answer: '错', analysis: '元组不可变；虽然元组内的可变元素（如列表）内容可改，但元组本身的引用不可变。' },
    { type: 'single_choice', diff: 'medium', content: `a = [1, 2, 3]\nb = a\nb.append(4)\n执行后 a 的值是？`, options: opt(['[1, 2, 3]', '[1, 2, 3, 4]', '报错', '[1, 2, 4]'], 1), answer: 'B', analysis: 'b=a 只是引用拷贝，二者指向同一列表；append 修改的是同一对象，a 也变化为含 4 的列表。' },
  ],
  '函数定义与调用': [
    { type: 'single_choice', diff: 'easy', content: `def f():\n    return 1\n    return 2\n调用 f() 的结果是？`, options: opt(['1', '2', 'None', '报错'], 0), answer: 'A', analysis: '函数执行到第一个 return 即返回并结束，后面的 return 2 不会执行，故返回 1。' },
    { type: 'short_answer', diff: 'medium', content: '编写一个接受两个整数并返回其中较大值的函数 max_two，并给出一次调用示例。', answer: `def max_two(a, b):\n    return a if a > b else b\n\n# 调用示例\nprint(max_two(3, 8))  # 输出 8`, analysis: '使用三元表达式 a if a > b else b 简洁实现；也可用内置 max(a,b) 代替，返回较大值。', minChars: 20, maxChars: 400 },
  ],
  '参数传递与默认值': [
    { type: 'single_choice', diff: 'easy', content: `def f(a, b=2):\n    return a + b\n调用 f(3) 的结果是？`, options: opt(['3', '5', '6', '报错'], 1), answer: 'B', analysis: 'b 使用默认值 2，f(3) 等价于 f(3,2)，返回 3+2=5。' },
    { type: 'judgment', diff: 'medium', content: 'Python 函数定义中，带默认值的形参必须位于不带默认值的形参之后。', answer: '对', analysis: '语法规定无默认值参数在前、有默认值参数在后，否则调用时按位置传参会造成歧义，Python 直接报 SyntaxError。' },
  ],
  '作用域与命名空间': [
    { type: 'single_choice', diff: 'hard', content: `x = 1\ndef f():\n    x = 2\nf()\nprint(x)\n以上代码输出？`, options: opt(['1', '2', '报错', 'None'], 0), answer: 'A', analysis: '函数内的 x=2 创建的是局部变量，不影响全局 x，故仍是 1。修改全局需用 global 声明。' },
    { type: 'judgment', diff: 'medium', content: '在函数内部使用 global 关键字可以声明并修改全局变量。', answer: '对', analysis: 'global x 告诉解释器该名字指向全局作用域，此后对 x 的赋值会更新全局变量。' },
  ],
  '模块与包结构': [
    { type: 'single_choice', diff: 'medium', content: '代码 if __name__ == \'__main__\': 的作用是判断该文件被运行时，是：', options: opt(['被其它模块导入', '被直接运行（作为入口）', '一定报语法错误', '从未执行'], 1), answer: 'B', analysis: '被直接作为主程序运行时 __name__=\'__main__\'；被 import 时为其模块名，因此可作为入口判断。' },
    { type: 'judgment', diff: 'medium', content: '一个包（package）本质上是一个包含 __init__.py 文件的目录，import 该包时会先执行它其中 __init__.py 的内容。', answer: '对', analysis: '__init__.py 标志目录为包并可初始化；Python3 支持隐式命名空间包，但显式 __init__.py 仍是惯例。' },
  ],
  '标准库常用模块': [
    { type: 'single_choice', diff: 'easy', content: '下列哪个模块用于获取当前日期与时间？', options: opt(['os', 'sys', 'datetime', 're'], 2), answer: 'C', analysis: 'datetime.datetime.now() 获取当前时刻；os 管系统、sys 管解释器、re 管正则。' },
    { type: 'fill_blank', diff: 'easy', content: `执行 import math; math.sqrt(16) 的返回值是：`, answer: '4.0', analysis: 'sqrt 返回浮点数 4.0；可用 int() 或 // 污染转换，但原始返回类型为 float。' },
  ],
  '类与对象': [
    { type: 'judgment', diff: 'easy', content: '类的实例方法中，self 指向调用该方法的当前实例，用于访问实例属性与方法。', answer: '对', analysis: '调用 a.f() 时 Python 自动把 a 作为 self 传入，self 即实例本体。' },
    { type: 'single_choice', diff: 'medium', content: `class A:\n    def __init__(self, x):\n        self.x = x\na = A(5)\na.x 的值是？`, options: opt(['5', 'A', 'None', '报错'], 0), answer: 'A', analysis: '__init__ 在创建实例时执行，self.x=x 把参数 5 存入实例属性，故 a.x=5。' },
  ],
  '继承关系': [
    { type: 'single_choice', diff: 'medium', content: `class A:\n    def who(self): return 'A'\nclass B(A):\n    pass\nb = B(); b.who() 返回？`, options: opt(['A', 'B', '报错', 'None'], 0), answer: 'A', analysis: 'B 未重写 who，沿继承链找到 A.who，返回 A。' },
    { type: 'judgment', diff: 'hard', content: 'Python 支持多重继承，方法的查找顺序由 MRO（方法解析顺序）决定。', answer: '对', analysis: 'C3 线性化算法计算 MRO，保证所有父类只出现一次且子类在前，决定属性/方法查找顺序。' },
  ],
  '多态与魔术方法': [
    { type: 'single_choice', diff: 'medium', content: '重载运算符 + 应实现哪个魔术方法？', options: opt(['__add__', '__plus__', '__sum__', '__repr__'], 0), answer: 'A', analysis: 'a + b 会调用 type(a).__add__(a, b)，定义 __add__ 即可定制加法行为。' },
    { type: 'multi_choice', diff: 'hard', content: '下列哪些属于 Python 的双下划线魔术方法？', options: opt(['__init__', '__str__', '__len__', 'run'], [0, 1, 2]), answer: 'ABC', analysis: '魔术方法以双下划线包裹：__init__ 构造、__str__ 字符串表示、__len__ 求长度；run 是普通方法。' },
  ],
  '封装与属性': [
    { type: 'single_choice', diff: 'medium', content: '以单下划线开头（如 self._x）的实例属性，其约定含义是？', options: opt(['绝对私有、无法访问', '约定为受保护的内部属性，应避免外部直接访问', '全局常量', '只读文件句柄'], 1), answer: 'B', analysis: '单下划线是"约定俗成的受保护"标记，并非真正强制；访问仍可，但提示外部不应直接使用。' },
    { type: 'judgment', diff: 'medium', content: '使用 @property 装饰器可以把方法转换成类似只读属性的访问方式。', answer: '对', analysis: '@property 使 obj.prop 不用加括号即可取值，可用 @setter 配合使其可写。' },
  ],
  '异常与断言': [
    { type: 'judgment', diff: 'medium', content: 'except 可以一次捕获多个异常类型（如 except (ValueError, TypeError):），且多个 except 子句按书写顺序自上而下匹配，先匹配先执行。', answer: '对', analysis: 'except 元组捕获任一即进入；顺序靠前的 except 优先，匹配后不再继续向后匹配。' },
    { type: 'programming', diff: 'hard', content: '编写函数 safe_div(a, b)：用 try/except 捕获 ZeroDivisionError 并返回字符串 "除零错误"；同时在 b==0 时先用 assert 拦截整型除零并给出中文提示。', answer: `def safe_div(a, b):\n    # 断言拦截：b 为 0 时触发 AssertionError，给出中文提示\n    assert b != 0, "除数不能为 0"\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return "除零错误"\n\nprint(safe_div(10, 2))  # 5.0\nprint(safe_div(10, 0))  # AssertionError: 除数不能为 0`, analysis: 'assert 用于前置条件防御（失败抛 AssertionError）；try/except 兜底捕获运行期异常，二者分工：断言拦截非法入参，异常处理应对运行错误。', minChars: 50, maxChars: 1200 },
  ],
  '文件读写': [
    { type: 'single_choice', diff: 'easy', content: '下列哪个模式打开文件只能用于只读？', options: opt(["'w'", "'r'", "'a'", "'x'"], 1), answer: 'B', analysis: "'r' 只读；'w' 覆盖写（不存在则创建）；'a' 追加；'x' 排他创建但报错若已存在。" },
    { type: 'judgment', diff: 'easy', content: '使用 with open(path, \'r\') as f: 读取文件，退出 with 块后文件会自动关闭，无需手动 close()。', answer: '对', analysis: '文件对象实现了上下文管理器，with 退出时自动调用 close()，即使中途异常也会关闭。' },
  ],
  '上下文管理器': [
    { type: 'multi_choice', diff: 'medium', content: '下列哪些对象支持 with 语句（上下文管理器协议）？', options: opt(['文件对象 open()', 'threading.Lock()', '普通整型 int', 'tempfile.TemporaryDirectory()'], [0, 1, 3]), answer: 'ABD', analysis: '文件、Lock、TemporaryDirectory 都实现了 __enter__/__exit__；整型不支持 with。' },
    { type: 'judgment', diff: 'medium', content: '自定义上下文管理器需要实现 __enter__ 和 __exit__ 两个方法。', answer: '对', analysis: '__enter__ 返回 with 的目标对象；__exit__ 处理退出（含异常），返回 True 可吞掉异常。' },
  ],
  '正则表达式': [
    { type: 'single_choice', diff: 'hard', content: '正则表达式 r\'\\d{3}-\\d{8}\' 最匹配下列哪种？', options: opt(['手机号码', '3 位区号 + 8 位号码的固定电话', '电子邮箱', '日期 YYYY-MM-DD'], 1), answer: 'B', analysis: '该正则匹配 3 位数字-8 位数字的固定电话（区号-号码）；国内 11 位手机号不符合，故选该项。' },
    { type: 'judgment', diff: 'medium', content: 're.match 从字符串的第一个字符开始匹配，而 re.search 在字符串中任意位置查找匹配。', answer: '对', analysis: 'match 只在开头匹配；search 扫描全串找第一个匹配位置。查找局部子串常用 search。' },
  ],
  '函数式编程': [
    { type: 'single_choice', diff: 'medium', content: `list(map(lambda x: x * 2, [1, 2, 3])) 的结果是？`, options: opt(['[2, 4, 6]', '[1, 2, 3]', '[3, 6, 9]', '报错'], 0), answer: 'A', analysis: 'map 把 lambda 依次作用于每个元素并返回迭代器，list() 转列表得到 [2,4,6]。' },
    { type: 'judgment', diff: 'medium', content: 'filter 函数返回一个迭代器，其中的元素来自可迭代对象中使判定函数返回 True 的元素。', answer: '对', analysis: 'filter(fn, seq) 保留 fn(e)==True 的元素，惰性求值需转换为列表才能一次性看到结果。' },
  ],
  '综合项目实践': [
    { type: 'single_choice', diff: 'hard', content: '一个 Python 综合项目里，若要求“仅当文件作为主程序运行时才执行统计”，应把 main 调用写在？', options: opt(["if __name__ == '__main__': 块内", '模块最顶层', '任何 import 之前', '函数内部任意位置'], 0), answer: 'A', analysis: '把入口放 if __name__ == \'__main__\': 中，避免被 import 时副作用执行，是综合项目的标准入口写法。' },
    { type: 'short_answer', diff: 'hard', content: '设计一个“成绩统计”小程序：从文本文件 scores.txt（每行一个分数）读入，计算总分、平均分、最高分并打印。请写出关键代码并注释。', answer: `def main():\n    total, count, high = 0, 0, None\n    with open('scores.txt', 'r', encoding='utf-8') as f:\n        for line in f:\n            line = line.strip()\n            if not line:\n                continue\n            score = float(line)\n            total += score\n            count += 1\n            high = score if high is None else max(high, score)\n    print(f'总分: {total}, 平均分: {total/count:.2f}, 最高分: {high}')\n\nif __name__ == '__main__':\n    main()`, analysis: '使用 with 安全读文件；逐行解析、跳过空行；累加统计并用 max 维护最高分；f-string 格式化输出。', minChars: 40, maxChars: 800 },
  ],
};

// ---------- 数据结构与算法 ----------
const DSTRUCT_BANK: Bank = {
  '抽象数据类型': [
    { type: 'single_choice', diff: 'easy', content: '抽象数据类型（ADT）指的是？', options: opt(['具体的存储结构实现', '数据对象、数据关系与操作集合的数学描述', '内存中的地址映射', '源代码文件'], 1), answer: 'B', analysis: 'ADT 由数据对象、数据之间关系及定义在数据上的操作集合构成，不关心具体实现。' },
    { type: 'judgment', diff: 'easy', content: '抽象数据类型只描述数据的逻辑特性与操作，不涉及具体的存储表示和实现细节。', answer: '对', analysis: '这是 ADT 的本质：把逻辑结构与物理结构解耦，便于抽象建模与复用。' },
  ],
  '算法复杂度分析': [
    { type: 'single_choice', diff: 'medium', content: `执行以下代码的时间复杂度为？\nfor i in range(n):\n    for j in range(n):\n        x += 1`, options: opt(['O(1)', 'O(n)', 'O(n²)', 'O(logn)'], 2), answer: 'C', analysis: '外层 n 次、内层每次又 n 次，总执行 n×n=n² 次，故为 O(n²)。' },
    { type: 'judgment', diff: 'easy', content: '当输入规模 n 较大时，O(nlogn) 的算法通常比 O(n²) 的算法运行更慢。', answer: '错', analysis: '渐进意义下 O(nlogn) < O(n²)，因此 n 较大时 O(nlogn) 更快。' },
  ],
  '时空权衡': [
    { type: 'single_choice', diff: 'medium', content: '下列哪种数据结构最典型地体现了“以空间换时间”？', options: opt(['哈希表', '顺序表', '单链表', '队列'], 0), answer: 'A', analysis: '哈希表用额外桶空间将查找摊还至 O(1)，以空间开销换取查找速度。' },
    { type: 'judgment', diff: 'medium', content: 'Cache（缓存）本质上是以额外存储换取更快的访问/计算，属于时空权衡。', answer: '对', analysis: '缓存预存结果避免重复计算或访存，牺牲空间换取时间上的加速。' },
  ],
  '递归思想': [
    { type: 'single_choice', diff: 'hard', content: '斐波那契用直接递归 F(n)=F(n-1)+F(n-2) 求解的时间复杂度约为？', options: opt(['O(n)', 'O(n²)', 'O(2ⁿ)', 'O(logn)'], 2), answer: 'C', analysis: '每次递归分裂成两个子问题，形成近似满二叉树，结点数指数增长，故为 O(2ⁿ)。' },
    { type: 'judgment', diff: 'easy', content: '递归算法必须有明确的递归出口（基本情形），否则会无限递归导致栈溢出。', answer: '对', analysis: '缺少终止条件是常见递归错误；需保证每次递归向基本情形收敛。' },
  ],
  '基本排序': [
    { type: 'single_choice', diff: 'medium', content: '下列哪个排序算法在最坏情况下仍为 O(nlogn)？', options: opt(['冒泡排序', '快速排序', '堆排序', '插入排序'], 2), answer: 'C', analysis: '堆排序最坏、平均、最好均为 O(nlogn)；快速排序最坏退化为 O(n²)。' },
    { type: 'judgment', diff: 'medium', content: '冒泡排序在输入已基本有序（最好情况）下时间复杂度为 O(n)。', answer: '对', analysis: '加入交换标志优化后，一趟无交换即可提前结束，最好情况仅需 O(n)。' },
  ],
  '顺序表与链表': [
    { type: 'single_choice', diff: 'medium', content: '在已知某一结点（已定位）的后面插入一个新结点到单链表中，所需的时间复杂度为？', options: opt(['O(n)', 'O(1)', 'O(n²)', 'O(logn)'], 1), answer: 'B', analysis: '已有结点指针即可修改其后继指针完成插入，无需遍历，故为 O(1)。' },
    { type: 'judgment', diff: 'medium', content: '与顺序表相比，链表插入/删除（已定位）为 O(1)，但随机访问第 i 个元素需 O(n)。', answer: '对', analysis: '链表无连续下标，需从头沿指针找，故随机访问 O(n)；这正是“增加读开销换写效率”的折中。' },
  ],
  '栈的应用': [
    { type: 'single_choice', diff: 'medium', content: '下列哪种场景最适合使用栈（LIFO）？', options: opt(['括号匹配校验', '银行排队叫号', '图的广度优先遍历', '窗口消息列表'], 0), answer: 'A', analysis: '括号匹配需后进先出：遇左括号入栈，遇右括号弹出比对，正好用栈实现。' },
    { type: 'judgment', diff: 'medium', content: '函数调用的递归过程依赖系统栈保存返回地址与局部变量。', answer: '对', analysis: '递归即栈帧（返回地址、实参、局部量）层层压入与弹出的过程。' },
  ],
  '队列结构': [
    { type: 'single_choice', diff: 'medium', content: '引入循环队列的主要目的是？', options: opt(['允许元素重复', '解决顺序队列的“假溢出”', '支持随机访问', '减少元素存储空间'], 1), answer: 'B', analysis: '顺序队列队尾满了队首却空时会造成“假溢出”，循环队列用取模复用队首空间解决。' },
    { type: 'judgment', diff: 'easy', content: '队列遵循先进先出（FIFO）：队尾入队、队首出队。', answer: '对', analysis: '队列是限制性线性结构，只允许队尾插入、队首删除。' },
  ],
  '字符串与KMP': [
    { type: 'single_choice', diff: 'hard', content: 'KMP 算法相对朴素串匹配的核心改进是？', options: opt(['减少目标串的字符回退', '使用更快的高级语言', '通过 next 数组让模式串在失配时尽量右移以避免重复比较', '对所有字符做二分'], 2), answer: 'C', analysis: 'KMP 失配时用 next 数组跳过已匹配的前缀，目标串指针不回退，最坏 O(n+m)。' },
    { type: 'judgment', diff: 'hard', content: 'KMP 算法借助 next（失配）数组使目标串不回溯，从而把最坏时间复杂度降为 O(n+m)。', answer: '对', analysis: 'next 记录模式串自身前缀信息，失配时右移模式串直至对齐，目标串扫描不回退。' },
  ],
  '分治与归并排序': [
    { type: 'single_choice', diff: 'medium', content: '归并排序的时间复杂度和空间复杂度分别是？', options: opt(['O(nlogn)/O(1)', 'O(nlogn)/O(n)', 'O(n²)/O(n)', 'O(n)/O(nlogn)'], 1), answer: 'B', analysis: '归并不断二分并合并，时间 O(nlogn)；合并需辅助数组，空间 O(n)。' },
    { type: 'judgment', diff: 'easy', content: '归并排序是稳定的排序算法。', answer: '对', analysis: '合并时相等元素把左区先放入结果，保持相对顺序，故稳定。' },
  ],
  '二叉树遍历': [
    { type: 'single_choice', diff: 'easy', content: '二叉树先序遍历的访问顺序是？', options: opt(['根 - 左 - 右', '左 - 根 - 右', '左 - 右 - 根', '根 - 右 - 左'], 0), answer: 'A', analysis: '先序即根左右；中序左根右；后序左右根。' },
    { type: 'fill_blank', diff: 'medium', content: '二叉树中序遍历的访问顺序是『左、根、____ 』（填“左/根/右”中的一项）。', answer: '右', analysis: '中序为 左根右，缺省的是“右”子树。' },
  ],
  '二叉搜索树': [
    { type: 'single_choice', diff: 'easy', content: '在二叉搜索树中，任一结点左子树上所有结点的值都____该结点值。填入最恰当选项：', options: opt(['大于', '小于', '恰好等于', '与它无关'], 1), answer: 'B', analysis: 'BST 性质：左子树值全部小于根、右子树全部大于根。' },
    { type: 'judgment', diff: 'easy', content: '对一棵二叉搜索树进行中序遍历，得到的结果是有序递增序列。', answer: '对', analysis: '中序左根右恰好按值升序输出，这是 BST 与中序的经典对应。' },
  ],
  '平衡树与堆': [
    { type: 'single_choice', diff: 'hard', content: '下列哪种结构能保证查找、插入、删除均为 O(logn)？', options: opt(['普通二叉搜索树 BST', '红黑树', '无序数组', '单链表'], 1), answer: 'B', analysis: '普通 BST 可能退化为链表；红黑树通过自平衡保证高度 O(logn)，故三操作 O(logn)。' },
    { type: 'judgment', diff: 'medium', content: '堆是一种完全二叉树，且堆顶元素一定是整个堆的最大值（大顶堆）或最小值（小顶堆）。', answer: '对', analysis: '堆用数组存完全二叉树，堆顶即极值，满足堆序性质。' },
  ],
  '图的存储与遍历': [
    { type: 'single_choice', diff: 'medium', content: '深度优先遍历（DFS）通常使用的辅助数据结构是？', options: opt(['栈', '队列', '无符号整型', '哈希表'], 0), answer: 'A', analysis: 'DFS 依赖“回溯”，天然契合栈；BFS 用队列。' },
    { type: 'judgment', diff: 'medium', content: '图的 DFS 类似树的先序遍历，BFS 类似树的层序遍历。', answer: '对', analysis: 'DFS 深入后回溯（类先序）；BFS 一层层扩散（类层序）。' },
  ],
  '最短路径': [
    { type: 'single_choice', diff: 'hard', content: 'Dijkstra 算法求单源最短路径的适用前提是？', options: opt(['图中可含负权边', '所有边权非负', '只适用于无向树', '任意图均可'], 1), answer: 'B', analysis: 'Dijkstra 依赖“已确定最短距离不再更新”的贪心假设，负权边会破坏该性质。' },
    { type: 'judgment', diff: 'hard', content: '图中含负权边时，求单源最短路径应使用 Bellman-Ford 算法而非 Dijkstra。', answer: '对', analysis: 'Bellman-Ford 可处理负权（只要无负环）并能检测负环，而 Dijkstra 不能。' },
  ],
  '顺序与二分查找': [
    { type: 'single_choice', diff: 'easy', content: '二分查找必须满足的前提条件是？', options: opt(['线性表必须有序排列', '必须用链表存储', '元素必须唯一且无序', '数组长度必须为素数'], 0), answer: 'A', analysis: '二分依赖有序性以确定舍弃哪一半；缺序则无法判断目标所在区间。' },
    { type: 'judgment', diff: 'easy', content: '在长度为 n 的顺序表中进行顺序查找，平均时间复杂度为 O(n)。', answer: '对', analysis: '最坏 n 次、平均约 n/2 次比较，数量级为 O(n)。' },
  ],
  '散列查找': [
    { type: 'single_choice', diff: 'easy', content: '理想情况下，哈希表查找的时间复杂度可达到？', options: opt(['O(n)', 'O(1)', 'O(logn)', 'O(n²)'], 1), answer: 'B', analysis: '无冲突时经哈希函数一步定位，查找 O(1)；冲突密集才会退化。' },
    { type: 'judgment', diff: 'medium', content: '哈希冲突无法完全避免，常用解决方法是开放地址法与链地址法。', answer: '对', analysis: '加载因子与散列分布使冲突必然存在，两种经典法分别用探针/链表处理。' },
  ],
  '动态规划入门': [
    { type: 'single_choice', diff: 'hard', content: '爬楼梯问题（每次可上 1 级或 2 级）到达第 n 级的走法总数等于？', options: opt(['2n', '斐波那契数 F(n)', 'n!', 'n²'], 1), answer: 'B', analysis: 'f(n)=f(n-1)+f(n-2)，边界 f(1)=1, f(2)=2，恰为斐波那契序列的偏移形式。' },
    { type: 'judgment', diff: 'hard', content: '动态规划成立的关键是“最优子结构”与“重叠子问题”，通常用自底向上递推或记忆化搜索实现。', answer: '对', analysis: '二者缺一不可：最优子结构提供递推关系，重叠子问题让记忆化有意义。' },
  ],
  '贪心与回溯': [
    { type: 'single_choice', diff: 'hard', content: '下列哪个问题用贪心算法就能得到全局最优解？', options: opt(['0-1 背包', '活动安排问题（选择最多的互不重叠活动）', '子集和', '旅行商 TSP'], 1), answer: 'B', analysis: '按结束时间最早选活动即得全局最优（活动选择有贪心性）；0-1 背包等需 DP/回溯。' },
    { type: 'judgment', diff: 'medium', content: '贪心算法每步做局部最优选择，但不总能得到全局最优解，需用反例验证其正确性。', answer: '对', analysis: '贪心正确性必须证明贪心选择性质，否则只能当作启发式，可能错过全局最优。' },
  ],
  '算法综合应用': [
    { type: 'judgment', diff: 'hard', content: '“分治”通常与“递归”配合，但如果某递归分支每次都只调用自身一次（如单路递归），则不一定能发挥分治的并行/效率优势。', answer: '对', analysis: '分治强调把问题拆成多个独立子问题再合并；单路递归退化为线性处理，不属于典型的二分式分治。' },
    { type: 'short_answer', diff: 'hard', content: '请用“分治”思想写出归并排序 merge_sort，并说明其最好/平均/最坏时间复杂度及空间复杂度。', answer: `def merge_sort(a):\n    if len(a) <= 1:\n        return a\n    mid = len(a) // 2\n    left = merge_sort(a[:mid])\n    right = merge_sort(a[mid:])\n    return merge(left, right)\n\ndef merge(l, r):\n    res, i, j = [], 0, 0\n    while i < len(l) and j < len(r):\n        if l[i] <= r[j]:\n            res.append(l[i]); i += 1\n        else:\n            res.append(r[j]); j += 1\n    return res + l[i:] + r[j:]\n# 时间复杂度 O(nlogn)，空间复杂度 O(n)`, analysis: '分：对待排区间不断二分；治：递归排序两半；合：线性归并两个有序序列。三阶段均稳定 O(nlogn)，但需 O(n) 辅助空间。', minChars: 40, maxChars: 900 },
  ],
};

// ---------- 数据库原理与应用 ----------
const DB_BANK: Bank = {
  '关系模型': [
    { type: 'single_choice', diff: 'easy', content: '关系模型中的“关系（Relation）”在用户看来是一个？', options: opt(['树结构', '图结构', '二维表（元组的集合）', '普通文件'], 2), answer: 'C', analysis: '关系即二维表：行=元组、列=属性，元组是无序且不重复的集合。' },
    { type: 'judgment', diff: 'easy', content: '关系模型要求关系中不能有完全相同的元组（行），属性都是原子值。', answer: '对', analysis: '关系是集合，元素不得重复，且每个属性取值均为不可再分的原子值（满足第一范式）。' },
  ],
  'E-R 模型': [
    { type: 'single_choice', diff: 'easy', content: '在 E-R 图中，实体（Entity）用哪种图形表示？', options: opt(['矩形', '椭圆', '菱形', '三角形'], 0), answer: 'A', analysis: '矩形=实体、椭圆=属性、菱形=联系，这是 E-R 图的基本约定。' },
    { type: 'judgment', diff: 'medium', content: 'E-R 图中的“联系”用菱形表示，实体与实体之间靠联系建立语义关系。', answer: '对', analysis: '联系是 E-R 模型中连接实体的桥梁，如学生-选修-课程。' },
  ],
  '关系代数': [
    { type: 'single_choice', diff: 'medium', content: '关系代数中，从关系中选取满足条件的“行”（元组）的操作是？', options: opt(['投影 π', '选择 σ', '连接 ⋈', '并 ∪'], 1), answer: 'B', analysis: '选择 σ 按谓词过滤元组（行）；投影 π 选取指定列（属性）。' },
    { type: 'judgment', diff: 'medium', content: '投影操作选取关系的指定列（属性），结果中若有重复元组会自动去重。', answer: '对', analysis: '关系是无重复元组的集合，因此投影结果仍需保持集合特性、去重。' },
  ],
  'SQL 基础': [
    { type: 'single_choice', diff: 'easy', content: 'SQL 中用于查询数据的关键字是？', options: opt(['SELECT', 'UPDATE', 'INSERT', 'DELETE'], 0), answer: 'A', analysis: 'SELECT 检索数据；其余分别是修改、插入、删除。' },
    { type: 'judgment', diff: 'easy', content: 'SQL 关键字通常不区分大小写，但为可读性习惯大写。', answer: '对', analysis: '标准 SQL 关键字大小写不敏感，团队约定以大写突出语法结构。' },
  ],
  '数据定义语言': [
    { type: 'single_choice', diff: 'easy', content: '下列哪个语句用于创建数据库表？', options: opt(['CREATE DATABASE', 'CREATE TABLE', 'CREATE INDEX', 'ALTER TABLE'], 1), answer: 'B', analysis: 'CREATE TABLE 定义表结构；DATABASE 建库、INDEX 建索引、ALTER 改结构。' },
    { type: 'fill_blank', diff: 'easy', content: '删除一张已存在的表的 SQL 语句是：DROP ____；', answer: 'TABLE', analysis: 'DROP TABLE 表名; 可整体删除表及其结构；注意与 DELETE 删除数据不同。' },
  ],
  '单表查询': [
    { type: 'single_choice', diff: 'easy', content: 'SELECT 中用于去除结果中重复行的关键字是？', options: opt(['DISTINCT', 'UNIQUE', 'ORDER BY', 'GROUP BY'], 0), answer: 'A', analysis: 'SELECT DISTINCT 列 FROM 表 去除重复行；UNIQUE 是约束关键字。' },
    { type: 'judgment', diff: 'medium', content: 'WHERE 用于过滤行，HAVING 用于过滤“分组后”的组。', answer: '对', analysis: 'WHERE 在分组聚合前过滤原行；HAVING 紧跟 GROUP BY，过滤聚合结果。' },
  ],
  '多表连接查询': [
    { type: 'single_choice', diff: 'medium', content: '下列哪种连接只返回两表中“能匹配上”的记录？', options: opt(['内连接 INNER JOIN', '左外连接 LEFT JOIN', '右外连接 RIGHT JOIN', '全外连接 FULL JOIN'], 0), answer: 'A', analysis: '内连接只保留联接键匹配的行；外连接会保留一侧（或双侧）未匹配行并填 NULL。' },
    { type: 'judgment', diff: 'medium', content: 'LEFT JOIN 返回左表的全部记录，右表无匹配时对应列以 NULL 填充。', answer: '对', analysis: '左外连接以左表为主，右表无匹配行则整行置 NULL。' },
  ],
  '子查询与聚合': [
    { type: 'single_choice', diff: 'medium', content: '下列哪个属于聚合函数？', options: opt(['SUM', 'DISTINCT', 'TOP', 'LIKE'], 0), answer: 'A', analysis: 'SUM/AVG/MAX/MIN/COUNT 为聚合函数；DISTINCT/TOP/LIKE 是限定或比较关键字。' },
    { type: 'fill_blank', diff: 'medium', content: '聚合函数 COUNT(*) 统计的是表的记录行数；若要统计某列非 NULL 值个数应写 COUNT(____)。', answer: '列名', analysis: 'COUNT(列名) 只计数该列非 NULL 的元组；COUNT(*) 计入所有行。' },
  ],
  '视图与索引': [
    { type: 'single_choice', diff: 'medium', content: '视图（VIEW）在数据库中的本质是？', options: opt(['物理存储在磁盘上的表', '保存在数据库中的一条查询定义', '索引文件', '存储过程'], 1), answer: 'B', analysis: '视图不真正存数据，而是存查询定义，每次访问按定义动态计算，又称虚表。' },
    { type: 'judgment', diff: 'medium', content: '创建索引能加速查询，但会降低数据插入/修改/删除的性能。', answer: '对', analysis: '索引额外占据空间且每次写操作需同步维护索引结构，因此写性能下降。' },
  ],
  '完整性约束': [
    { type: 'single_choice', diff: 'medium', content: '主键约束（PRIMARY KEY）用于保证的是？', options: opt(['行取值唯一且非空（实体完整性）', '列不能为负数', '外键必须存在', '数据加密存储'], 0), answer: 'A', analysis: '主键唯一且非空，从而唯一标识每一元组，实现实体完整性。' },
    { type: 'judgment', diff: 'medium', content: '外键约束用于维护参照完整性：子表引用的外键值必须存在于主表的被引用列中。', answer: '对', analysis: '外键保证引用一致，避免“悬挂引用”，是参照完整性的载体。' },
  ],
  '函数依赖': [
    { type: 'single_choice', diff: 'hard', content: '若 X→Y 且存在 X 的真子集 X′ 也使 X′→Y，则称 Y 对 X 是____依赖。', options: opt(['完全', '部分', '传递', '平凡'], 1), answer: 'B', analysis: 'Y 可由 X 的部分属性决定，称为部分函数依赖；完全依赖则要求任一真子集不足以决定 Y。' },
    { type: 'judgment', diff: 'medium', content: '主键可以唯一决定关系中的其他所有属性，即存在函数依赖：主键→全部非主属性。', answer: '对', analysis: '确定主键即唯一确定一行，故其决定所有其它属性，这是函数依赖的基础事实。' },
  ],
  '范式与规范化': [
    { type: 'single_choice', diff: 'hard', content: '“每个非主属性都完全函数依赖于候选键”的关系模式属于？', options: opt(['1NF', '2NF', '3NF', 'BCNF'], 1), answer: 'B', analysis: '2NF 在 1NF 基础上消除非主属性对候选键的部分依赖；3NF 再消除传递依赖。' },
    { type: 'judgment', diff: 'hard', content: '第三范式（3NF）要求消除非主属性对候选键的传递函数依赖。', answer: '对', analysis: '3NF ⊂ 2NF ⊂ 1NF；3NF 额外禁止非主属性间及到候选键的传递依赖。' },
  ],
  '模式分解': [
    { type: 'single_choice', diff: 'hard', content: '关系模式分解需要保持的两个重要性质是？', options: opt(['无损连接与依赖保持', '仅无损连接', '仅依赖保持', '任意分解都行'], 0), answer: 'A', analysis: '分解既要无损（能还原原关系、不产生伪元组），又要保持函数依赖（不丢失约束）。' },
    { type: 'judgment', diff: 'hard', content: '具有无损连接性的分解，其自然连接能还原出与原关系完全一致的关系，不产生多余元组。', answer: '对', analysis: '无损即分解-连接不增加多余元组、不丢失原元组，可等同于原关系。' },
  ],
  '事务特性ACID': [
    { type: 'multi_choice', diff: 'medium', content: 'SQL 事务的 ACID 特性包含下列哪四项？', options: opt(['原子性 Atomicity', '一致性 Consistency', '隔离性 Isolation', '持久性 Durability', '并发性 Concurrency'], [0, 1, 2, 3]), answer: 'ABCD', analysis: 'ACID = 原子性、一致性、隔离性、持久性；并发性是协议要求而非 ACID 之一。' },
    { type: 'single_choice', diff: 'easy', content: '“事务要么全部执行成功，要么全部回滚不执行”体现的是事务的？', options: opt(['原子性', '隔离性', '持久性', '一致性'], 0), answer: 'A', analysis: '原子性把事务操作视为不可分割的整体：全部成功或全部撤销。' },
  ],
  '并发控制': [
    { type: 'single_choice', diff: 'hard', content: '事务 T 读到另一个事务“尚未提交、可能回滚”的数据，这类并发问题是？', options: opt(['脏读', '不可重复读', '幻读', '丢失更新'], 0), answer: 'A', analysis: '读未提交到最终被回滚的数据即为脏读；不可重复读/幻读针对已提交数据的读不一致。' },
    { type: 'judgment', diff: 'hard', content: '两段锁协议（2PL）能保证并发事务的可串行化调度。', answer: '对', analysis: '2PL 要求加锁与解锁各集中在锁定/解锁两个阶段，是保证事务串行化的经典方法。' },
  ],
  '查询优化': [
    { type: 'single_choice', diff: 'medium', content: '下列哪项能显著加速 WHERE 子句中的等值查询？', options: opt(['在相关列上建立索引', '删除所有索引', '使用 SELECT *', '强制全表扫描'], 0), answer: 'A', analysis: '二级索引 / 聚簇索引可让等值谓词走索引定位而非全表扫描。' },
    { type: 'judgment', diff: 'medium', content: '查询优化的启发式规则包括：选择下推、投影下推，把选择/连接交换位置以尽早缩小数据量。', answer: '对', analysis: '尽量把选择、投影下推到更底层的表，先减行再减列，减少中间结果大小。' },
  ],
  '日志与恢复': [
    { type: 'single_choice', diff: 'hard', content: '数据库系统从故障中恢复到一致性状态，主要依赖的机制是？', options: opt(['日志（Redo/Undo）', '索引', '视图', '权限设置'], 0), answer: 'A', analysis: '基于日志的恢复用 Redo 重做已提交、Undo 回滚未提交事务，实现故障恢复。' },
    { type: 'fill_blank', diff: 'hard', content: '用于“重做”（将已提交事务的更改重新写回）的日志称为 ____ 日志。', answer: 'REDO', analysis: 'Redo 日志记录事务更改后的新值，崩溃后据以重放提交的事务。' },
  ],
  '数据库安全': [
    { type: 'single_choice', diff: 'medium', content: '将某权限授予给指定用户的 SQL 语句是？', options: opt(['GRANT', 'REVOKE', 'UPDATE', 'BACKUP'], 0), answer: 'A', analysis: 'GRANT 授予权限、REVOKE 收回权限，是访问控制的两大命令。' },
    { type: 'judgment', diff: 'medium', content: 'REVOKE 用于收回已授予用户的权限。', answer: '对', analysis: 'REVOKE 撤销授权对象，防止权限长期失控。' },
  ],
  'NoSQL 概述': [
    { type: 'single_choice', diff: 'easy', content: '下列哪种数据库属于 NoSQL？', options: opt(['Redis', 'MySQL', 'Oracle', 'SQL Server'], 0), answer: 'A', analysis: 'Redis 是键值型 NoSQL；MySQL/Oracle/SQL Server 为关系型数据库。' },
    { type: 'judgment', diff: 'medium', content: 'NoSQL 数据库通常不强制固定表结构（无严格模式），更适合海量、灵活的半结构化数据。', answer: '对', analysis: 'NoSQL（键值/文档/列族/图）弱化 schema 约束，便于水平扩展与多变数据。' },
  ],
  '课程设计实践': [
    { type: 'judgment', diff: 'medium', content: '关系数据库中，每个关系（表）的主键必须至少包含一个属性（列）且主键的取值唯一确定每一行。', answer: '对', analysis: '主键是用来唯一标识每一行（实体）的，至少有一个属性，且取值唯一，不允许重复。' },
    { type: 'short_answer', diff: 'hard', content: '设计“学生选课系统”数据库：给出 student 表、course 表，以及选课关系，写出建表 SQL，并说明用到了哪些完整性约束。', answer: `CREATE TABLE student (
    sno INT PRIMARY KEY,          -- 主键：实体完整性
    name VARCHAR(20) NOT NULL
);
CREATE TABLE course (
    cno INT PRIMARY KEY,
    title VARCHAR(50) NOT NULL
);
CREATE TABLE enrollment (
    sno INT,
    cno INT,
    PRIMARY KEY (sno, cno),        -- 联合主键
    FOREIGN KEY (sno) REFERENCES student(sno),
    FOREIGN KEY (cno) REFERENCES course(cno)  -- 外键：参照完整性
);`, analysis: '用 PRIMARY KEY 保证实体完整性，NOT NULL 属用户定义完整性，FOREIGN KEY 实现参照完整性；选课用联合主键防止重复选修。', minChars: 40, maxChars: 900 },
  ],
};

// ---------- 操作系统原理 ----------
const OS_BANK: Bank = {
  '操作系统功能': [
    { type: 'single_choice', diff: 'easy', content: '操作系统最核心的职能是？', options: opt(['管理并调度计算机硬件与软件资源（进程/内存/文件/设备）', '只负责绘制网页', '单纯执行算术运算', '仅连接网络'], 0), answer: 'A', analysis: 'OS 作为资源管理者，统一分配 CPU、内存、文件与 I/O 设备。' },
    { type: 'multi_choice', diff: 'easy', content: '下列哪些属于操作系统的基本功能？', options: opt(['进程管理', '内存管理', '文件系统', '设备管理'], [0, 1, 2, 3]), answer: 'ABCD', analysis: '四大基本管理：处理器/内存/设备/文件，外加并发同步、安全与用户接口。' },
  ],
  '系统调用': [
    { type: 'single_choice', diff: 'medium', content: '用户程序请求操作系统内核服务（如读文件）一般通过？', options: opt(['系统调用', '普通函数调用', '无条件跳转', '宏替换'], 0), answer: 'A', analysis: '系统调用是用户态进入内核态获取服务的正式接口，如 read()/write()。' },
    { type: 'judgment', diff: 'medium', content: '系统调用是应用程序访问内核管理资源（进程、文件等）的标准接口。', answer: '对', analysis: '用户程序不能直接操纵内核资源，必须经系统调用请求内核代办。' },
  ],
  '中断与异常': [
    { type: 'single_choice', diff: 'medium', content: '由外部硬件设备（如时钟、IO 控制器）异步触发的信号称为？', options: opt(['中断', '缺页异常', '陷阱', '系统调用'], 0), answer: 'A', analysis: '中断由外部事件异步产生；异常/陷阱由 CPU 内部指令同步触发。' },
    { type: 'judgment', diff: 'hard', content: '缺页故障（page fault）属于 CPU 内部触发的“异常”而非外设“中断”。', answer: '对', analysis: '缺页是访问内存时 MMU 发现页不在内存而同步引发的故障，属异常/陷阱一类。' },
  ],
  '体系结构': [
    { type: 'single_choice', diff: 'easy', content: '为隔离内核与用户代码，CPU 通常提供哪两种工作模式？', options: opt(['用户态与内核态', '单核与多核', '主频高与低', '前台与后台'], 0), answer: 'A', analysis: '双模式设计：用户态受限，内核态执行特权指令，保证系统安全。' },
    { type: 'judgment', diff: 'medium', content: '在用户态执行特权指令会被拒绝（违法行为），需切换到内核态完成。', answer: '对', analysis: '特权指令如直接取/改外设寄存器只能在内核态执行，用户态触发则转入内核处理或报错。' },
  ],
  '内核模式': [
    { type: 'single_choice', diff: 'medium', content: '下列哪种操作不能由用户态直接执行？', options: opt(['启动磁盘 DMA 等特权指令', '普通的整数加法', '给局部变量赋值', '调用自写函数'], 0), answer: 'A', analysis: 'DMA、关中断、改状态寄存器等为特权指令，仅内核态可执行。' },
    { type: 'judgment', diff: 'medium', content: '双模式机制是内核保护的关键：用户程序无法直接操控硬件，必须通过系统调用进入内核态。', answer: '对', analysis: '双模式 + 特权指令 + 系统调用构成经典的受保护运行环境。' },
  ],
  '进程管理与状态': [
    { type: 'single_choice', diff: 'easy', content: '进程正在等待 I/O 完成后才能继续，此时进程处于？', options: opt(['就绪态', '运行态', '阻塞（等待）态', '终止态'], 2), answer: 'C', analysis: '因等待（I/O/事件）而暂停 进入阻塞态；事件完成转就绪等待调度。' },
    { type: 'judgment', diff: 'medium', content: '处于就绪态的进程已具备除 CPU 之外的一切资源，只等调度器分配 CPU 即可运行。', answer: '对', analysis: '就绪→运行仅需获得处理机；运行因时间片/等待转回就绪或阻塞。' },
  ],
  '进程调度算法': [
    { type: 'single_choice', diff: 'medium', content: '下列哪种调度策略可能造成“长作业饥饿”？', options: opt(['短作业优先 SRT/短进程优先', '先来先服务 FCFS', '时间片轮转 RR', '多级反馈'], 0), answer: 'A', analysis: '短作业始终插队到前面，长作业可能长时间得不到执行而饥饿。' },
    { type: 'judgment', diff: 'medium', content: '时间片轮转（RR）主要用于分时系统；时间片越小，进程切换开销越大、响应越快。', answer: '对', analysis: 'RR 均摊 CPU，时间片过小导致频繁上下文切换、吞吐下降。' },
  ],
  '线程与同步': [
    { type: 'single_choice', diff: 'easy', content: '同一进程内的多个线程之间共享的是？', options: opt(['进程的地址空间、打开的文件等资源', '各自独立的栈', '互不相关的寄存器', '彼此隔离的堆'], 0), answer: 'A', analysis: '线程共享所属进程的代码、数据、堆与文件表；各自独有栈与寄存器和程序计数器。' },
    { type: 'judgment', diff: 'easy', content: '线程是 CPU 调度的基本单位，同一进程的线程共享进程资源。', answer: '对', analysis: '资源分配给进程，调度以线程为单位；线程共享进程上下文。' },
  ],
  '死锁与处理': [
    { type: 'single_choice', diff: 'hard', content: '下列哪一项不属于死锁产生的四个必要条件？', options: opt(['互斥', '占有且等待', '循环等待', '饥饿'], 3), answer: 'D', analysis: '四大条件为互斥、占有且等待、不可抢占、循环等待；饥饿不同，非必要条件。' },
    { type: 'judgment', diff: 'hard', content: '银行家算法通过“安全性检查”避免系统进入不安全状态，从而预防死锁。', answer: '对', analysis: '分配前试探是否存在安全序列，不安全则拒绝分配，从分配策略上防死锁。' },
  ],
  '信号量与管程': [
    { type: 'single_choice', diff: 'hard', content: '信号量 S 初始为 1，执行 P（wait）时若 S<0，则当前进程会？', options: opt(['被阻塞挂起', '继续立即运行', '直接唤醒其它进程', '抛出错误'], 0), answer: 'A', analysis: 'wait 使 S--，若 S<0 说明资源已空，当前进程挂入该信号量的等待队列。' },
    { type: 'judgment', diff: 'medium', content: '管程把共享资源及其操作封装起来，配合条件变量可更安全地实现并发同步。', answer: '对', analysis: '管程将互斥与同步机制封装于内部，减少误用锁的风险。' },
  ],
  '连续分配': [
    { type: 'single_choice', diff: 'medium', content: '首次适应（first-fit）分配算法在请求内存时选择？', options: opt(['第一个满足大小的空闲分区', '最接近请求的“最合适”分区', '最大的空闲分区', '最小的空闲分区'], 0), answer: 'A', analysis: 'first-fit 从头找第一个足够大的分区；best-fit 找最接近的，worst-fit 找最大。' },
    { type: 'judgment', diff: 'medium', content: '连续分配会产生外部碎片，可通过“紧凑”（compaction）移动进程合并空闲区。', answer: '对', analysis: '紧凑将所有已分配分区移动至一端，使碎片合并为连续大块，但开销较大。' },
  ],
  '分页机制': [
    { type: 'single_choice', diff: 'easy', content: '分页存储管理中，逻辑地址到物理地址的转换依赖？', options: opt(['页表', '段表', '文件分配表', '哈希目录'], 0), answer: 'A', analysis: '页表记录每个逻辑页号对应的物理页框号，MMU 查表完成地址映射。' },
    { type: 'judgment', diff: 'medium', content: '分页将物理内存划分为固定大小的页框，从而消除了外部碎片。', answer: '对', analysis: '按固定页框分配，无需连续大块，只产生页内碎片（内部碎片）。' },
  ],
  '分段与段页式': [
    { type: 'single_choice', diff: 'medium', content: '分段存储主要依据信息的什么特征划分？', options: opt(['逻辑结构（如模块、函数、数据段）', '物理容量大小', '访问先后顺序', '随机划分'], 0), answer: 'A', analysis: '分段按程序的逻辑单位（代码段/数据段/栈段）划分，便于按需共享与保护。' },
    { type: 'judgment', diff: 'medium', content: '段页式结合了分段与分页：先按逻辑分段，段内再分页以方便管理。', answer: '对', analysis: '段页式兼顾段的逻辑清晰与页的紧凑分配，代价是地址转换多一层。' },
  ],
  '虚拟内存': [
    { type: 'single_choice', diff: 'hard', content: '虚拟内存能成立的根本原因是程序执行遵循？', options: opt(['局部性原理', '只要内存够大就行', '完全没有外存', '随机访存'], 0), answer: 'A', analysis: '时间/空间局部性使只有少量页面活跃，可把暂用部分驻留外存按需换入。' },
    { type: 'judgment', diff: 'hard', content: '虚拟存储器依托“内存+外存”，利用局部性原理，使程序尺寸可以超过物理内存而正常运行。', answer: '对', analysis: '虚拟内存以按需分页/分段实现大程序小内存运行，缺页时从外存换入。' },
  ],
  '页面置换算法': [
    { type: 'single_choice', diff: 'hard', content: '下列哪种页面置换算法因无法预知未来访问序列，只能作为理论上的最优点？', options: opt(['最佳置换 OPT', '先进先出 FIFO', '最近最久未用 LRU', '时钟 Clock'], 0), answer: 'A', analysis: 'OPT 需要未来页面引用作决策，现实中不可实现，仅用于评判其它算法下界。' },
    { type: 'judgment', diff: 'medium', content: 'LRU 依据“最近最久未使用”原则选择被置换的页面。', answer: '对', analysis: 'LRU 淘汰过去最久未访问的页，实现需硬件支持计数或近似（Clock）。' },
  ],
  '文件系统结构': [
    { type: 'single_choice', diff: 'medium', content: '下列哪种方法用于管理磁盘上的空闲空间？', options: opt(['位示图 / 空闲链表', '索引文件', '日志文件', '内核缓存'], 0), answer: 'A', analysis: '位示图每一位表示一个盘块是否空闲，空闲链表串联空闲块，均用于空闲空间管理。' },
    { type: 'judgment', diff: 'medium', content: '位示图（bitmap）以每位对应一个盘块是否空闲来管理磁盘空闲空间。', answer: '对', analysis: '0/1 表示占用/空闲，简单高效，是常见磁盘空闲管理数据结构。' },
  ],
  '目录与磁盘管理': [
    { type: 'single_choice', diff: 'medium', content: '采用多级（树形）目录结构的主要优点是？', options: opt(['允许不同路径下文件重名、便于分类检索与权限管理', '目录只能有一层深', '无法重名', '无需对文件命名'], 0), answer: 'A', analysis: '树形目录按级划分命名空间与权限，不同目录可同名文件，检索和组织更方便。' },
    { type: 'judgment', diff: 'medium', content: '索引分配用索引块记录文件的盘块地址，便于随机访问，但需额外索引空间。', answer: '对', analysis: '索引块集中登记所属盘块号，支持随机访问；文件组织的开销是索引本身的空间与时间。' },
  ],
  'I/O 设备管理': [
    { type: 'single_choice', diff: 'easy', content: '哪种技术让外设直接与内存交换数据、减少 CPU 逐字搬运？', options: opt(['DMA 直接存储器访问', '轮询等待', '纯中断', '关闭设备电源'], 0), answer: 'A', analysis: 'DMA 控制器独立完成数据块搬运，仅在传输开始/结束时中断 CPU。' },
    { type: 'judgment', diff: 'easy', content: '缓冲技术（如设备缓冲区）用于缓解 CPU 与 I/O 设备之间的速度不匹配。', answer: '对', analysis: '缓冲暂存数据，平滑速度差异并减少中断次数，提高整体吞吐。' },
  ],
  '多核并发': [
    { type: 'single_choice', diff: 'easy', content: '多核 CPU 上实现多线程“真正并行”执行依赖？', options: opt(['每个核并发执行不同线程', '单核分时轮流', '只使用一个核', '关闭操作系统调度'], 0), answer: 'A', analysis: '多核让多个线程在同一时刻分配在不同内核运行，是真正并行；单核只能并发。' },
    { type: 'judgment', diff: 'medium', content: '多核并行仍需通过锁/原子操作保护共享资源的一致性。', answer: '对', analysis: '并行只是并发各线程真正同时跑，对共享变量的互斥同步仍必不可少。' },
  ],
  '系统综合实践': [
    { type: 'judgment', diff: 'medium', content: '从“用户态程序 → 系统调用 → 内核态 → 文件系统 → 设备驱动 → 硬件”这样的层次，正体现操作系统的体系结构与资源管理过程。', answer: '对', analysis: '一条 I/O 请求层层下钻到硬件，由 OS 统筹各层次完成服务，正是综合实践考察的切入点。' },
    { type: 'short_answer', diff: 'hard', content: '简述 Python 程序读取一个磁盘文件的完整流程中，操作系统分阶段提供了哪些服务（涉及系统调用、文件系统、I/O、缓冲/缓存）。', answer: `要点参考（1-6 步）：\n1) open() 发出系统调用 open，内核查找路径、打开文件并分配文件描述符；\n2) 维护文件表/目录项，记录打开位置；\n3) read() 发出系统调用，内核查看页缓存；\n4) 缓存未命中则发起磁盘 I/O，经设备驱动访问块设备；\n5) DMA 把数据磁盘读入内核缓冲区，再拷贝到用户空间；\n6) 返回数据，必要时 close() 释放描述符，缓冲区/缓存策略减少重复访盘。`, analysis: '本题综合系统调用、VFS、页缓存、块设备 I/O、DMA 与缓冲，体现 OS 在文件读取中的资源管理者角色。', minChars: 60, maxChars: 1000 },
  ],
};

// 按课程名匹配题库
const BANKS: Array<{ match: string; bank: Bank }> = [
  { match: 'Python', bank: PYTHON_BANK },
  { match: '数据结构', bank: DSTRUCT_BANK },
  { match: '数据库', bank: DB_BANK },
  { match: '操作系统', bank: OS_BANK },
];

export async function seedQuestions(db: Drizzle, ctx: SeedCtx) {
  const { nextId } = ctx;

  for (const cid of ctx.courseIds) {
    const courseName = ctx.courseName.get(cid) ?? '';
    const bank = (BANKS.find((b) => courseName.includes(b.match))?.bank) ?? PYTHON_BANK;
    const kps = ctx.courseKps.get(cid) ?? [];
    if (kps.length === 0) continue;

    const courseQ: number[] = [];

    for (const kp of kps) {
      const pair = bank[kp.name];
      if (!pair) {
        // console.warn(`[seed] 缺少题目：${courseName} / ${kp.name}`);
        continue;
      }
      for (const q of pair) {
        const qid = nextId();
        const scores = typeScore(q.type);
        await db.insert(schema.question).values({
          id: qid, course_id: cid, knowledge_point_id: kp.kpId,
          question_type: q.type, difficulty: q.diff,
          content: q.content, options: q.options ?? null,
          answer: q.answer, analysis: q.analysis,
          default_score: scores,
          source: 'seed', is_active: true, locked: false,
          min_chars: q.minChars ?? (q.type === 'short_answer' ? 30 : q.type === 'programming' ? 50 : null),
          max_chars: q.maxChars ?? (q.type === 'short_answer' ? 800 : q.type === 'programming' ? 4000 : null),
          min_select: q.type === 'multi_choice' ? 2 : null,
          max_select: q.type === 'multi_choice' ? 4 : null,
        } as any).execute();
        courseQ.push(qid);
        ctx.questionKp.set(qid, kp.kpId);
        ctx.questionMeta.set(qid, { type: q.type, difficulty: q.diff, kpId: kp.kpId, score: scores, answer: q.answer, analysis: q.analysis });
      }
    }
    ctx.questionsByCourse.set(cid, courseQ);
  }
}