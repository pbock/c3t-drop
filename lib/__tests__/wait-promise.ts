import wait from '../wait-promise';

describe('wait', () => {
  it('returns a promise factory that resolves after `timeout` ms', async () => {
    const timeout = 20;
    const start = Date.now();
    await wait(timeout)();
    expect(Date.now()).toBeCloseTo(start + timeout, -2);
  });

  it('resolves with its argument', async () => {
    const waiter = wait(0);
    expect(await waiter('foo')).toEqual('foo');
    const obj = {};
    expect(await waiter(obj)).toBe(obj);
  });
});
