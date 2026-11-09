import type { TodoStatus } from './state-machines.js';

// Re-export from state-machines for usage
export type { TodoStatus } from './state-machines.js';

export interface TodoItem {
  id: string;
  description: string;
  status: TodoStatus;
  createdAt: number;
  updatedAt: number;
}

export interface TodoList {
  items: TodoItem[];
  lastUpdated: number;
}
