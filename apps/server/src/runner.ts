export interface RunRequest {
  source: string;
  stdin: string;
}

export interface Runner {
  run(request: RunRequest): Promise<string>;
}
