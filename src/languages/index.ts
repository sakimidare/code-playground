import type { LanguageSpec } from '../core/types'

const cppTemplate = `#include <iostream>
using namespace std;

int main() {
  int a, b;
  cin >> a >> b;
  cout << a + b << endl;
  return 0;
}
`

const cTemplate = `#include <stdio.h>

int main() {
  int a, b;
  scanf("%d %d", &a, &b);
  printf("%d\\n", a + b);
  return 0;
}
`

const pythonTemplate = `def main():
    a, b = map(int, input().split())
    print(a + b)


if __name__ == "__main__":
    main()
`

const rustTemplate = `fn main() {
    let mut line = String::new();
    std::io::stdin().read_line(&mut line).unwrap();
    let sum: i32 = line
        .trim()
        .split_whitespace()
        .map(|x| x.parse::<i32>().unwrap())
        .sum();
    println!("{}", sum);
}
`

export const defaultLanguages: LanguageSpec[] = [
  {
    id: 'cpp',
    label: 'C++',
    monacoLanguage: 'cpp',
    extension: 'cpp',
    pistonLanguage: 'c++',
    godboltLanguage: 'c++',
    template: cppTemplate,
  },
  {
    id: 'c',
    label: 'C',
    monacoLanguage: 'c',
    extension: 'c',
    pistonLanguage: 'c',
    godboltLanguage: 'c',
    template: cTemplate,
  },
  {
    id: 'python',
    label: 'Python',
    monacoLanguage: 'python',
    extension: 'py',
    pistonLanguage: 'python',
    godboltLanguage: 'python',
    template: pythonTemplate,
  },
  {
    id: 'rust',
    label: 'Rust',
    monacoLanguage: 'rust',
    extension: 'rs',
    godboltLanguage: 'rust',
    template: rustTemplate,
  },
]
