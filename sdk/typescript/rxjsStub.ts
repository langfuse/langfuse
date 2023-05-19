export class Observable<T> {
  constructor(private promise: Promise<T>) {}

  toPromise() {
    return this.promise;
  }

  pipe<S>(callback: (value: T) => S | Promise<S>): Observable<S> {
    return new Observable(this.promise.then(callback));
  }
}

export function from<T>(promise: Promise<any>) {
  return new Observable(promise);
}

export function of<T>(value: T) {
  return new Observable<T>(Promise.resolve(value));
}

export function mergeMap<T, S>(callback: (value: T) => Observable<S>) {
  return (value: T) => callback(value).toPromise();
}

export function map(callback: any) {
  return callback;
}
