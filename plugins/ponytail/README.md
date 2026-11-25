# Ponytail for Farero

Turn on Ponytail to have your agent look for the smallest change that solves the task. Install it
from **Settings → Plugins**, then enable it where you want it. It loads in Claude Code, Codex and
OpenCode when the provider opens a chat. Start a chat in one of those providers to use it right away.

Send `/ponytail lite`, `/ponytail full` or `/ponytail ultra` to choose a level. Use
`/ponytail off` to switch it off, or `/ponytail default <level>` to set the default for new chats.
Ponytail also includes review, audit, debt, gain and help skills.

Claude Code's hooks write Ponytail's task ledger in Farero. The interactive band appears in
Claude Code's terminal and desktop interfaces.

An enabled provider can run Ponytail's local code automatically in a chat with unrestricted
execution. If OpenCode loses a command acknowledgement, Farero checks the chat and shows
**Delivery unconfirmed** when it cannot establish the outcome. It sends the command only once.

## Source and license

The package contains the provider files from Dietrich Gebert's [Ponytail 5.3.3](https://github.com/DietrichGebert/ponytail/tree/7801d061243d7b753bad0e0b3c057cd250b11755).
The release recipe pins those files byte for byte. The MIT license is in `licenses/LICENSE`.
