import type { RunResult } from '../core/types'

function formatOutput(text: string): string {
  return text.length === 0 ? '（无输出）' : text
}

export function OutputPanel({ result }: { result: RunResult }) {
  const verdict = result.compileError
    ? '编译失败'
    : result.timedOut
      ? '运行超时'
      : result.exitCode === 0
        ? '运行成功'
        : `运行出错 (exit ${result.exitCode})`

  const cls = result.compileError
    ? 'verdict-bad'
    : result.timedOut
      ? 'verdict-bad'
      : result.exitCode === 0
        ? 'verdict-ok'
        : 'verdict-bad'

  const stderrText = result.compileError
    ? (result.compileMessage ?? result.stderr)
    : result.stderr

  return (
    <div className="output-panel">
      <div className="output-header">
        <span className={`verdict ${cls}`}>{verdict}</span>
        <span className="output-meta">{(result.durationMs / 1000).toFixed(2)}s</span>
      </div>

      <div className="output-block">
        <div className="output-block-title">标准输出</div>
        <pre className="output-pre">{formatOutput(result.stdout)}</pre>
      </div>

      {stderrText.trim().length > 0 && (
        <div className="output-block">
          <div className="output-block-title">标准错误</div>
          <pre className="output-pre output-pre-err">{stderrText}</pre>
        </div>
      )}
    </div>
  )
}
