// Local CLI writer lock. Python owns flock; Node forwards the inherited descriptor.
import { fstatSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawnSync, type StdioOptions } from "node:child_process"

export async function withKnowledgeLock(write: boolean, main: () => Promise<void>) {
  if (!write) return main()
  const wrapper = join(homedir(), "2nd/scripts/with-pipeline-lock.py")
  const fd = Number(process.env.KNOWLEDGE_PIPELINE_LOCK_FD ?? -1)
  let inherited = false
  if (Number.isInteger(fd) && fd >= 3 && fd < 1024) {
    try {
      fstatSync(fd)
      const stdio: StdioOptions = Array.from({ length: fd + 1 }, (_, index) =>
        index < 3 ? "ignore" : index === fd ? fd : "ignore")
      inherited = spawnSync("python3", [wrapper, "--check-inherited"], { stdio }).status === 0
    } catch {
      inherited = false
    }
  }
  if (inherited) return main()
  // Preserve tsx loader arguments as well as the script and its CLI flags.
  const child = spawnSync("python3", [wrapper, "--", process.execPath,
    ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit" })
  process.exitCode = child.status ?? 1
}
