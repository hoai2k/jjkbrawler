# Canon anime reference

Screen-accurate reference art pulled from
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), used as the
authority for a character's **design** — hair, face, outfit, colours, props.

Only the **(Anime)** versions belong here. The wiki also carries manga panels
and colour-spread art; those disagree with the show on palette often enough
that mixing them is how a character ends up half-right.

These are downloaded copies so the request docs still resolve if the wiki
moves a file. The source URL for each is recorded below — re-fetch from there
rather than editing these in place.

| File | Source |
|---|---|
| `gakuganji_anime.png` | [Yoshinobu Gakuganji (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/3/3c/Yoshinobu_Gakuganji_%28Anime%29.png/revision/latest?cb=20201025154546) |
| `gakuganji_guitar_anime.png` | [Gakuganji's cursed technique (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/8/86/Gakuganji%27s_cursed_technique_%28Anime%29.png/revision/latest?cb=20210316092547) |
| `reggie_anime.png` | [Reggie Star (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/0/01/Reggie_Star_%28Anime%29.png/revision/latest?cb=20260403035700) |
| `reggie_intro_anime.png` | [Reggie Star introduction (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/2/27/Reggie_Star_introduction_%28Anime%29.png/revision/latest?cb=20260226172413) |
| `uro_anime.png` | [Takako Uro (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/8/84/Takako_Uro_%28Anime%29.png/revision/latest?cb=20260324045602) |
| `uro_face_anime.png` | [Takako Uro angry (Anime).png](https://static.wikia.nocookie.net/jujutsu-kaisen/images/f/f2/Takako_Uro_angry_%28Anime%29.png/revision/latest?cb=20260327143156) |

Finding a character's file, if you need one that is not here yet: the wiki's
character page lists its images, and the full-body render is almost always
titled `<Full Name> (Anime).png`. The MediaWiki API resolves a title to a
direct URL without scraping the page:

```sh
curl -sS -G "https://jujutsu-kaisen.fandom.com/api.php" \
  --data-urlencode "action=query" --data-urlencode "prop=imageinfo" \
  --data-urlencode "iiprop=url" --data-urlencode "format=json" \
  --data-urlencode "titles=File:Takako Uro (Anime).png"
```

Swap `prop=imageinfo`/`titles=File:…` for `prop=images`/`titles=<Character>`
to list every image on a character's page first.

This directory is **reference only** — nothing here is loaded by the game.
