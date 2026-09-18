import spriteUrl from '@launchpad-ui/icons/sprite.svg?url';

/**
 * LaunchPad's `Icon` renders `<use href="#lp-icon-<name>">`, so the sprite has
 * to be inlined in the document. It is ~215 kB of paths, so it is fetched as a
 * separate cacheable asset rather than bundled into the app's JavaScript, and
 * injected without blocking first paint.
 */
export async function installIconSprite(target: Document = document): Promise<void> {
  if (target.getElementById('lp-icon-sprite')) return;

  const response = await fetch(spriteUrl);
  if (!response.ok) return;

  const holder = target.createElement('div');
  holder.id = 'lp-icon-sprite';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.position = 'absolute';
  holder.style.width = '0';
  holder.style.height = '0';
  holder.style.overflow = 'hidden';
  holder.innerHTML = await response.text();
  target.body.prepend(holder);
}
