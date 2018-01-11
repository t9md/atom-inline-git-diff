const {BufferedProcess} = require("atom")

function runCommand(options, stdin) {
  const bufferedProcess = new BufferedProcess(options)
  bufferedProcess.onWillThrowError(({error, handle}) => {
    if (error.code === "ENOENT" && error.syscall.indexOf("spawn") === 0) {
      console.log("ERROR")
    }
    handle()
  })
  // if (stdin) {
  //   bufferedProcess.process.stdin.write(stdin)
  //   bufferedProcess.process.stdin.end()
  // }
  return bufferedProcess
}

function runGitCommand(cmdline, stdin, cwd) {
  let stdoutText = ""
  let exit
  const exitPromise = new Promise(resolve => (exit = () => resolve(stdoutText)))
  runCommand(
    {
      command: "git",
      args: cmdline.split(/\s+/g),
      stdout: data => (stdoutText += data),
      stderr: data => console.warn("mgit: ", data),
      exit,
      options: {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        cwd: cwd,
      },
    },
    stdin
  )
  return exitPromise
}

module.exports = class Git {
  constructor(repo) {
    this.repo = repo
  }

  run(cmdline, stdin) {
    return runGitCommand(cmdline, stdin, this.repo.getWorkingDirectory())
  }

  async diff(file, rev) {
    return this.run(`diff ${rev} -- ${file}`)
  }

  async diffWithText(file, rev, text) {
    return this.run(`diff --no-index -- ${file} -`, text)
  }
}
