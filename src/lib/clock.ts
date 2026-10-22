import type { Logger } from './logger';
import type { Status } from './status';

// Sets the clock once per connection, in Menu mode, on the first status with rtc=1.
// `rtc` can drop back to 0 and `u` can reply `ERR rtc`: that is no clock yet, so the next rtc=1 tries again.
export function clockSetter(logger: Pick<Logger, 'cmd'>) {
  let set = false;
  return async (s: Status) => {
    if (set || s.state !== 'menu' || !s.rtc) return;
    set = true;
    const r = await logger.cmd('u', Math.floor(Date.now() / 1000)).catch(() => null);
    set = r?.ok ?? false;
  };
}
