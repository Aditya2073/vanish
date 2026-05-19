export type WorkerInbound =
  | { type: 'LOAD' }
  | {
      type: 'GENERATE';
      id: string;
      image: ImageBitmap;
      prompt: string;
      maxNewTokens: number;
    };

export type WorkerStatus = 'loading' | 'ready' | 'generating' | 'error';

export type ProgressInfo = {
  status?: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

export type WorkerOutbound =
  | { type: 'STATUS'; status: 'loading'; progress?: ProgressInfo }
  | { type: 'STATUS'; status: 'ready' }
  | { type: 'STATUS'; status: 'generating'; id: string; token: string }
  | { type: 'STATUS'; status: 'error'; message: string; id?: string }
  | { type: 'RESULT'; id: string; text: string };
