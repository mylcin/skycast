# Records docs/demo.gif with charmbracelet/vhs, against the local fixture
# server, so the recording never depends on the network or today's weather.
#
#   npm run build && vhs demo/demo.tape
#
# The "Demo GIF" workflow runs the same thing in CI.

Output docs/demo.gif
Require node

Set Shell "bash"
Set FontSize 15
Set Width 1000
Set Height 620
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set CursorBlink false

Env TZ "Europe/Istanbul"
Env LANG "en_GB.UTF-8"
Env SKYCAST_FORECAST_URL "http://127.0.0.1:4580/v1/forecast"
Env SKYCAST_GEOCODING_URL "http://127.0.0.1:4580/v1/search"
Env SKYCAST_CONFIG_DIR "/tmp/skycast-demo/config"
Env SKYCAST_CACHE_DIR "/tmp/skycast-demo/cache"

Hide
Type "PORT=4580 node scripts/fixture-server.ts > /dev/null 2>&1 &"
Enter
Type "alias skycast='node dist/cli.mjs'"
Enter
Sleep 1s
Type "clear"
Enter
Show

Type "skycast now Istanbul"
Sleep 300ms
Enter
Sleep 3.5s

Type "clear && skycast forecast Istanbul --days 5"
Sleep 300ms
Enter
Sleep 3.5s

Type "clear && skycast hourly Istanbul --hours 24 --compact"
Sleep 300ms
Enter
Sleep 3.5s

Type "clear && skycast compare Istanbul 'Paris, France' 'New York'"
Sleep 300ms
Enter
Sleep 3.5s

Type "clear && skycast now İstanbul --lang tr --compact"
Sleep 300ms
Enter
Sleep 2.5s

Type "skycast now Istanbul --json | head -n 14"
Sleep 300ms
Enter
Sleep 4s
