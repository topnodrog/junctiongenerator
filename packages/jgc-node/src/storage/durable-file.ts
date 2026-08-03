import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "fs";
import { dirname } from "path";

/** Best-effort directory sync. Windows does not allow opening directories. */
export function syncDirectory(path: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" && code !== "EINVAL" && code !== "EPERM" && code !== "EISDIR") {
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Write, flush, and atomically replace a file, then flush its directory. */
export function atomicWriteFile(file: string, tmp: string, data: Buffer | string): void {
  writeFileSync(tmp, data);
  const fd = openSync(tmp, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  syncDirectory(dirname(file));
}

/** Append one complete buffer and force it to stable storage before returning. */
export function durableAppend(file: string, data: Buffer): void {
  const fd = openSync(file, "a");
  try {
    let offset = 0;
    while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
