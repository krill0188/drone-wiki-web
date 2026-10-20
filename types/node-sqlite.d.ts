// @types/node 구버전에 node:sqlite 선언이 없어 사용하는 최소 부분만 선언한다(Node 24 내장, 읽기 전용으로만 사용).
declare module "node:sqlite" {
  export class StatementSync {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
  }
  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
