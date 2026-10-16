/**
 * 浏览器直存模式的持久化。
 *
 * 服务端模式的下载记录存在后端 SQLite 里，浏览器模式没有自己的进程可写，
 * 任务历史和用户选的目录句柄只能落在浏览器自己的 IndexedDB 里。
 * 目录句柄（FileSystemDirectoryHandle）是结构化的可克隆对象，IndexedDB 存得下，
 * 但授权状态不跟着句柄走，重新打开页面还得再问一次权限。
 */

export type BrowserDownloadTask = AnyListen.Download.ListItem

const DB_NAME = 'anylisten-browser-download'
const DB_VERSION = 1
const TASK_STORE = 'tasks'
const META_STORE = 'meta'

let dbPromise: Promise<IDBDatabase> | null = null

const openDB = (): Promise<IDBDatabase> => {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(TASK_STORE)) {
        db.createObjectStore(TASK_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Open browser download db failed'))
  })
  return dbPromise
}

const runRequest = <T>(
  mode: IDBTransactionMode,
  store: string,
  action: (objectStore: IDBObjectStore) => IDBRequest<T>
): Promise<T> =>
  openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = action(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Browser download db request failed'))
      })
  )

export const getBrowserTasks = () =>
  runRequest<BrowserDownloadTask[]>('readonly', TASK_STORE, (store) => store.getAll() as IDBRequest<BrowserDownloadTask[]>)

export const saveBrowserTask = (task: BrowserDownloadTask) =>
  runRequest<IDBValidKey>('readwrite', TASK_STORE, (store) => store.put(task))

export const removeBrowserTasks = (ids: string[]) =>
  Promise.all(
    ids.map((id) => runRequest<undefined>('readwrite', TASK_STORE, (store) => store.delete(id) as IDBRequest<undefined>))
  )

export const clearBrowserTasks = () =>
  runRequest<undefined>('readwrite', TASK_STORE, (store) => store.clear() as IDBRequest<undefined>)

export const getBrowserMeta = async <T>(key: string): Promise<T | null> => {
  const value = await runRequest<unknown>('readonly', META_STORE, (store) => store.get(key) as IDBRequest<unknown>)
  return (value as T | undefined) ?? null
}

export const setBrowserMeta = (key: string, value: unknown) =>
  runRequest<IDBValidKey>('readwrite', META_STORE, (store) => store.put(value, key))
