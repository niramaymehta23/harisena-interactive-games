# Host runbook: when something goes wrong

Read on your phone during the event. Each item says what you see, then what to do right now.
Buttons are in **bold**. The four buttons along the top of the host screen are
**Players**, **Audit** and **Session**, next to the game code.

## Before the first game (one minute)

- Tap **Session** and write down the **game code** and the **host PIN**. You need both if this phone dies.
- Keep a second phone or a laptop ready with the site open at `/host`.
- Charge the host phone. Turn off auto-lock if you can.

---

## Host phone

### Host phone died, ran flat, or you switched phones
1. On any other phone, open the site at **`/host`**.
2. Under **Take over a running session**, type the code and the PIN, then tap **Take over**.
3. You land on the same screen with the same scores. The game kept running on the server meanwhile:
   a round in progress ends on its own when the timer runs out.
- Five wrong PINs lock take-over for one minute.
- If the old phone comes back, it is still a host as well. Put it away so nobody taps on it.

### Host phone shows an old session, or "Connecting to ABCD…" and nothing happens
- Tap **Start a new session instead**, or
- Open **`/host?r=new`**, which opens the start screen without the old session.
- To finish the old one properly, open it and tap **Session → End session for everyone**.
  Every phone leaves and its scores are deleted. This cannot be undone.

### "Cannot reach the server" toast on the host phone
- The host phone lost its connection. Check its Wi-Fi or mobile data. The page reconnects by itself.
- The game keeps running without you. You just can't pause or skip until you're back.

---

## Players

### A player's phone died, they reloaded, or they're on a new phone
- **Same phone, page reloaded or closed:** open the same link again. It rejoins by itself.
- **New phone, or the browser forgot them (after Lock Teams):** they scan the QR and type **exactly the
  same name** (capital letters don't matter). A banner on your screen asks
  *"Someone typed … on a new phone. Is this …?"*. Tap **Yes, hand over**. The old phone shows
  "You are playing on another phone now". If it's actually a different person, tap **No, new player**.
  They go into the waiting list.
- **New phone before Lock Teams:** they join as "Name 2". Tap **Players**, tap the old offline "Name",
  then tap **Remove from the game**.

### Player removed by mistake
- Tap **Players**, scroll to **Removed**, then tap **Bring back** next to their name.
- They return to their old team and seat. Their phone switches back by itself within a few seconds.
- If they already tapped "Join a different game", bring them back first. They then rejoin with the same
  name, and you tap **Yes, hand over**.

### Late joiner (after Lock Teams)
- They join normally and see "Waiting for host".
- On your main screen, under **Waiting for a team**, tap **Red** or **Blue** next to their name.
- They play from the **next** round. During a round already running, they watch.

### Someone is on the wrong team
- **Before Lock Teams:** they tap **Switch to …** on their own phone.
- **After Lock Teams:** tap **Players**, tap their name, then tap **Move to Red** or **Move to Blue**.
  They get the next free seat number. The move is written in the audit.
- If you move someone during a round, they finish that round on their old team and switch when it ends.

### Teams locked by mistake
- On the **Pick a game** screen, tap **Unlock teams (locked by mistake)**.
- This only works **before the first game starts**. After that, fix teams with **Move** instead.
- Seat numbers are given out again the next time you lock.

### Someone isn't playing, or has left for good
- Tap **Players**, tap their name, then tap **Remove from the game**.
- A phone that stays off for a whole round doesn't count towards the score anyway (see Scores when
  phones are off). Removing them mainly keeps your Players list and the Maths Chain seats tidy.

### Bad Wi-Fi or phones dropping off
- A phone counts as offline after about 10 s with no signal. Its dot in **Players** turns grey,
  and the team header shows "N on".
- On the phone itself, the dot in the top right corner turns grey. Reloading the page is safe: it
  rejoins by itself.
- Pair Hunt, Shout and Maths Chain set up teams using **who is online when the round starts**.
  Before tapping **Start**, check in **Players** that people are back online.
- Offline phones are handled automatically. Pair Hunt re-pairs the partner, and Shout stops asking for
  that phone's buttons. Maths Chain passes the step after 15 s. Tap **Skip** to pass it sooner
  (see below).

---

## Server

### Server restarted or a deploy happened mid-round
- Every phone reconnects by itself within a few seconds. Nobody needs to rejoin.
- The round that was running is **thrown away** (scores from finished rounds are kept). Its content is
  new when you replay it.
- You're back on the screen before that round. Wait until **Players** shows people online again, then
  tap **Start Round …** again.
- Never run `fly deploy` during an event.

---

## Running a round

| You want to… | Tap |
|---|---|
| Stop the clock (all phones show "Paused") | **Pause**, then **Resume** |
| Stop the round now (it still counts, scored on what was done) | **End round early** |
| Throw away the last round and play it again with new content | **Replay this round** (results screen) or **Replay last round** (game over screen) |
| Stop the game, keep finished rounds | **Finish game and keep scores** (results screen) |
| Play one more round of a finished game | **Add another round** |
| Start a game over from scratch (its old scores are replaced) | **Restart game** in the game list |
| Fix the championship by hand | **Audit**, then scroll to **Manual adjustment**: team, ±points, reason, **Add** |
| See where every point came from | **Audit**, or **How were these points earned?** under results |

- Pause works only while the countdown or the round is running. Taps on phones are ignored while paused.
- Shout in turn-based mode: you can't finish the game until both Red and Blue have had their turn
  for that round.
- Manual adjustments add **championship** points (out of 300 total), not round points. They show in the
  audit and on the final.

---

## In-game problems: what to do now

### Pair Hunt: someone is stuck waiting for a partner who isn't looking
- The game handles this itself. A pair that hasn't found each other in **60 s** is split, with no
  penalty, and both get new partners (not each other).
- If the same person keeps causing it, remove them (**Players → name → Remove from the game**).
  Their partner is freed at once. **Bring back** after the round.

### Shout: one player is idle
- After 4 of their instructions time out in a row, their phone **rests for 20 s**. It gets no
  instructions and nobody is asked for its buttons. Your screen shows "… seems idle" and lists them as
  "idle" under the team. Tapping any button on their phone wakes it at once, with no penalty.
- If they've stopped playing, remove them (**Players → name → Remove from the game**).

### Shout: double taps
- A second tap on a button that was just pressed correctly, or a tap just after its time ran out, is
  ignored: **no −2**. A press nobody asked for still costs −2 and a 3 s lock.

### Shout: big teams
- Button names stay unique for teams of up to **36**. With 30 people this never comes up.

### Maths Chain: the chain stalls on someone
- Someone offline for 15 s is skipped automatically, counted from when they dropped. If they dropped
  long before their turn, they're skipped as soon as it comes.
- Someone online but not answering: on your screen tap **Skip [name] ([team])** and confirm. A second
  tap on the same button does nothing, so you can't skip two seats by accident. Tap the new button for
  the next person if you need to.
- People offline when the round starts are left out of the chain automatically.

### Maths Chain: one team has nobody online
- **Start** refuses with "… has nobody online". Wait for their phones, then start.
- If they all drop during the countdown, the round scores **0–0, void**, and your screen tells you so.
  Tap **Replay this round** once they're back.

### Scores when phones are off
- Pair Hunt and Shout divide the team's points by the players who were **online at some point during
  the round**. A dead phone no longer drags its team down. The results table shows "Played (score
  divides by this)" when that differs from the team size.

---

## What changed in the game code (fixes for the known issues)

1. **Pair Hunt idle partner.** Pairs unfound after 60 s are split and re-paired, with no penalty
   (`server/games/pairhunt.js` `splitStale`). The phone says "Time for a new partner".
2. **Shout double tap or late tap.** A press within 1 s of that button's hit or time-out is ignored
   (`server/games/shout.js` `forgive`). The phone also drops a second tap within 300 ms.
3. **Team size dilution.** Pair Hunt and Shout scores divide by the roster players seen online while
   the round was live (`server/room.js` `seg.seen`, `result.counted`).
4. **Shout idle phone.** It rests for 20 s after 4 own instructions time out in a row, and the host is
   warned (`rest()`).
5. **Maths offline and Skip.** The 15 s pass is counted from when the player dropped. Skip carries the
   player it was for, and a stale second tap is ignored.
6. **Shout over 18 players.** Each name set is dealt from all 144 names, so names stay unique up to 36.
7. **Maths empty team.** Start is refused while a team has nobody online. A round where a team had
   nobody is void (0–0) and the host is told to replay it.
