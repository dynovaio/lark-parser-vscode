# Lark Grammar for JSON

```lark
// This is a very simple (and incomplete) JSON parser

?start: value

?value: object
    | array
    | string
    | SIGNED_NUMBER -> number
    | "true" -> true
    | "false" -> false
    | "null" -> null

array  : "[" [value ("," value)*] "]"
object : "{" [pair ("," pair)*] "}"
pair   : string ":" value

string : ESCAPED_STRING

%import _common.ESCAPED_STRING
%import _common.SIGNED_NUMBER
%import _common.WS

%ignore WS
```
