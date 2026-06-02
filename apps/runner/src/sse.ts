import type { Response } from 'express'
import type { RunnerEvent } from '@opviz/shared'

export class SseHub {
  private clients = new Set<Response>()
  // Buffer of the current run's events so a client that connects (or refreshes) mid-run can
  // rebuild the full timeline instead of starting blank. Reset whenever a new run begins.
  private buffer: RunnerEvent[] = []

  addClient(res: Response) {
    this.clients.add(res)
    // Replay everything emitted so far for the active run before live streaming begins.
    for (const event of this.buffer) {
      this.write(res, event)
    }
    res.on('close', () => {
      this.clients.delete(res)
    })
  }

  send(event: RunnerEvent) {
    // A fresh run clears the replay history; control events (pause/resume) keep the buffer.
    if (event.type === 'run.started') {
      this.buffer = []
    }
    this.buffer.push(event)
    for (const res of this.clients) {
      this.write(res, event)
    }
  }

  private write(res: Response, event: RunnerEvent) {
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
}

