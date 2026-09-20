import { registerDefaults } from './engines'
import { CodePlayground } from './components/CodePlayground'

registerDefaults()

const binarySearchCode = `use std::io::{self, BufRead};

fn binary_search(arr: &[i32], target: i32) -> Option<usize> {
    let mut lo = 0usize;
    let mut hi = arr.len();
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if arr[mid] == target {
            return Some(mid);
        } else if arr[mid] < target {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    None
}

fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let first = lines.next().unwrap().unwrap();
    let mut it = first.split_whitespace();
    let n: usize = it.next().unwrap().parse().unwrap();
    let target: i32 = it.next().unwrap().parse().unwrap();

    let mut arr = vec![0i32; n];
    let second = lines.next().unwrap().unwrap();
    for (i, x) in second.split_whitespace().enumerate() {
        arr[i] = x.parse().unwrap();
    }

    match binary_search(&arr, target) {
        Some(i) => println!("found at {}", i),
        None => println!("not found"),
    }
}
`

const gcdCode = `use std::io::{self, BufRead};

fn gcd(mut a: i32, mut b: i32) -> i32 {
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a
}

fn main() {
    let stdin = io::stdin();
    let line = stdin.lock().lines().next().unwrap().unwrap();
    let mut it = line.split_whitespace();
    let a: i32 = it.next().unwrap().parse().unwrap();
    let b: i32 = it.next().unwrap().parse().unwrap();
    println!("{}", gcd(a, b));
}
`

function App() {
  return (
    <div className="blog">
      <header className="blog-header">
        <div className="blog-title">算法课堂</div>
        <div className="blog-tagline">每篇文章都配一个可以在浏览器里直接运行的 Rust 代码示例</div>
      </header>

      <article className="post">
        <h1>二分查找</h1>
        <p className="post-lead">
          在一个<strong>已排序</strong>的数组中查找目标值，每次把搜索区间缩小一半。
        </p>

        <h2>算法思路</h2>
        <ol>
          <li>维护区间 <code>[lo, hi]</code>，初始覆盖整个数组</li>
          <li>取中点 <code>mid = lo + (hi - lo) / 2</code>（防止 <code>lo + hi</code> 溢出）</li>
          <li>中点等于目标 → 找到；中点小于目标 → 搜右半；否则搜左半</li>
          <li>区间为空仍没找到 → 返回 <code>None</code></li>
        </ol>

        <h2>复杂度</h2>
        <table className="complexity">
          <tbody>
            <tr><th>时间复杂度</th><td>O(log n)</td></tr>
            <tr><th>空间复杂度</th><td>O(1)</td></tr>
          </tbody>
        </table>

        <h2>运行示例</h2>
        <div className="playground-hint">
          stdin 第一行是数组长度 <code>n</code> 和查找目标，第二行是 <code>n</code> 个升序整数。
          例如：<code>5 3</code> 与 <code>1 2 3 4 5</code>。
        </div>
        <CodePlayground
          initialLanguage="rust"
          lockLanguage
          defaultCode={binarySearchCode}
          defaultStdin={'5 3\n1 2 3 4 5'}
        />
      </article>

      <article className="post">
        <h1>最大公约数（欧几里得算法）</h1>
        <p className="post-lead">
          <code>gcd(a, b)</code> 基于<strong>辗转相除</strong>：两数的公约数等于较小数与余数的公约数。
        </p>

        <h2>算法思路</h2>
        <ol>
          <li>重复执行 <code>b != 0</code>：令 <code>t = a % b</code>，<code>a = b</code>，<code>b = t</code></li>
          <li>当 <code>b</code> 变为 0 时，<code>a</code> 就是最大公约数</li>
          <li>例：gcd(12, 18) → gcd(18, 12) → gcd(12, 6) → gcd(6, 0) = 6</li>
        </ol>

        <h2>运行示例</h2>
        <div className="playground-hint">
          stdin 输入两个正整数，如 <code>12 18</code>，输出它们的最大公约数。
        </div>
        <CodePlayground
          initialLanguage="rust"
          lockLanguage
          defaultCode={gcdCode}
          defaultStdin={'12 18'}
        />
      </article>

      <footer className="blog-footer">
        本页面的所有代码示例由 Code Playground 组件驱动：在线 Rust Playground 编译运行。
      </footer>
    </div>
  )
}

export default App
