export default function wait(timeout: number) {
  return function <T>(arg?: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(arg as T), timeout));
  };
}
