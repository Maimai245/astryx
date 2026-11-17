---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render`: an image named by a path from the site's root (`/pics/shoe.png`) shows in the file. Render reads it from the project's `public/` folder. When the project has none, it reads it from the nearest `public/` above the page, inside the project (or, outside a project, inside the folder you run the command from). The file carries the image with the page's other files, so `--reverse` puts it back under `public/` at the same path. A path that leaves `public/` (`/../x.png`) is not read. A path to a file that is not in `public/` gets the missing-image warning, as before.

@josephfarina
