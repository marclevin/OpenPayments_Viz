import type { Response } from 'express'
import type { RunnerEvent } from '@opviz/shared'

export class SseHub {
  private clients = new Set<Response>()

  addClient(res: Response) {
    this.clients.add(res)
    res.on('close', () => {
      this.clients.delete(res)
    })
  }

  send(event: RunnerEvent) {
    const data = JSON.stringify(event)
    for (const res of this.clients) {
      res.write(`event: ${event.type}\n`)
      res.write(`data: ${data}\n\n`)
    }
  }
}

