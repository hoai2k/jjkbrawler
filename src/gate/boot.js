/**
 * The entry point, ahead of the game.
 *
 * `index.html` loads this instead of `src/main.js` and `src/stats.js`, so the
 * door goes up first and both are imported only once the visitor is through.
 * Neither is downloaded by somebody who never gets in.
 *
 * The order of the two is preserved from the markup that used to load them:
 * the game first, visitor counting afterwards and separately, so nothing about
 * the counting can delay the game starting. It is also inside the door now,
 * which is the right side of it — counting a visitor who never got in would be
 * counting a stranger.
 *
 * The door is off on localhost, so `npm start` and the check tooling never meet
 * it — see the header of `gate.js`.
 */
import { openGate } from './gate.js';

openGate({
  title: 'JJK Brawler',
  blurb: 'This game is for friends of Hoai Nguyen. Use your invite link, or enter your code below.',
  game: 'jjkbrawler',
}).then(() => {
  import('../main.js');
  import('../stats.js');
});
