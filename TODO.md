# Diff Algorithms

The patience/histogram algorithms most of the times work better than
myers (default git diff algorithm) with text documents because they tend
to split long (i.e. multi-paragraph) diffs intro many (single-paragraph)
diffs, making the diff more readable (think of the case of many
modifications within near paragraphs: with myers one would see a very
long inline diff, whose word diffs would be difficult to read because
the whole diff may well exceed the screen height).

However, sometimes patience and histogram are not able to split a long
diff in the right way (i.e. keeping the corresponding paragraphs
together) leading to wrong (and highly confusing) word diffs.

A solution may be to use myers, and to split paragraphs within long
diffs (more than *n* lines) via javascript.
