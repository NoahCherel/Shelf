export const FOLDER_PREFIX = "folder:";

export interface WidgetFolder {
  name: string;
  widgets: string[];
}

export function isFolderId(id: string): boolean {
  return id.startsWith(FOLDER_PREFIX) && id.length > FOLDER_PREFIX.length;
}

export function makeFolderId(): string {
  return `${FOLDER_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Regular widgets and pins can live inside a folder; `apps` and nested folders cannot. */
export function canPutInFolder(id: string): boolean {
  return id !== "apps" && !isFolderId(id);
}
