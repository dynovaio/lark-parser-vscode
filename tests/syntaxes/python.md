# Lark grammar for Python 3

```lark
// Python 3 grammar for Lark

// This grammar should parse all python 3.x code successfully.

// Adapted from: https://docs.python.org/3/reference/grammar.html

// Start symbols for the grammar:
//       single_input is a single interactive statement;
//       file_input is a module or sequence of commands read from an input file;
//       eval_input is the input for the eval() functions.
// NB: compound_stmt in single_input is followed by extra NEWLINE!
//

single_input: _NEWLINE | simple_stmt | compound_stmt _NEWLINE
file_input: (_NEWLINE | stmt)*
eval_input: testlist _NEWLINE*

decorator: "@" dotted_name [ "(" [arguments] ")" ] _NEWLINE
decorators: decorator+
decorated: decorators (classdef | funcdef | async_funcdef)

async_funcdef: "async" funcdef
funcdef: "def" name "(" [parameters] ")" ["->" test] ":" suite

parameters: paramvalue ("," paramvalue)* ["," SLASH ("," paramvalue)*] ["," [starparams | kwparams]]
          | starparams
          | kwparams

SLASH: "/" // Otherwise the it will completely disappear and it will be undisguisable in the result
starparams: (starparam | starguard) poststarparams
starparam: "*" typedparam
starguard: "*"
poststarparams: ("," paramvalue)* ["," kwparams]
kwparams: "**" typedparam ","?

?paramvalue: typedparam ("=" test)?
?typedparam: name (":" test)?


lambdef: "lambda" [lambda_params] ":" test
lambdef_nocond: "lambda" [lambda_params] ":" test_nocond
lambda_params: lambda_paramvalue ("," lambda_paramvalue)* ["," [lambda_starparams | lambda_kwparams]]
          | lambda_starparams
          | lambda_kwparams
?lambda_paramvalue: name ("=" test)?
lambda_starparams: "*" [name]  ("," lambda_paramvalue)* ["," [lambda_kwparams]]
lambda_kwparams: "**" name ","?


?stmt: simple_stmt | compound_stmt
?simple_stmt: small_stmt (";" small_stmt)* [";"] _NEWLINE
?small_stmt: (expr_stmt | assign_stmt | del_stmt | pass_stmt | flow_stmt | import_stmt | global_stmt | nonlocal_stmt | assert_stmt)
expr_stmt: testlist_star_expr
assign_stmt: annassign | augassign | assign

annassign: testlist_star_expr ":" test ["=" test]
assign: testlist_star_expr ("=" (yield_expr|testlist_star_expr))+
augassign: testlist_star_expr augassign_op (yield_expr|testlist)
!augassign_op: "+=" | "-=" | "*=" | "@=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>=" | "**=" | "//="
?testlist_star_expr: test_or_star_expr
                   | test_or_star_expr ("," test_or_star_expr)+ ","?  -> tuple
                   | test_or_star_expr ","  -> tuple

// For normal and annotated assignments, additional restrictions enforced by the interpreter
del_stmt: "del" exprlist
pass_stmt: "pass"
?flow_stmt: break_stmt | continue_stmt | return_stmt | raise_stmt | yield_stmt
break_stmt: "break"
continue_stmt: "continue"
return_stmt: "return" [testlist]
yield_stmt: yield_expr
raise_stmt: "raise" [test ["from" test]]
import_stmt: import_name | import_from
import_name: "import" dotted_as_names
// note below: the ("." | "...") is necessary because "..." is tokenized as ELLIPSIS
import_from: "from" (dots? dotted_name | dots) "import" ("*" | "(" import_as_names ")" | import_as_names)
!dots: "."+
import_as_name: name ["as" name]
dotted_as_name: dotted_name ["as" name]
import_as_names: import_as_name ("," import_as_name)* [","]
dotted_as_names: dotted_as_name ("," dotted_as_name)*
dotted_name: name ("." name)*
global_stmt: "global" name ("," name)*
nonlocal_stmt: "nonlocal" name ("," name)*
assert_stmt: "assert" test ["," test]

?compound_stmt: if_stmt | while_stmt | for_stmt | try_stmt | match_stmt
              | with_stmt | funcdef | classdef | decorated | async_stmt
async_stmt: "async" (funcdef | with_stmt | for_stmt)
if_stmt: "if" test ":" suite elifs ["else" ":" suite]
elifs: elif_*
elif_: "elif" test ":" suite
while_stmt: "while" test ":" suite ["else" ":" suite]
for_stmt: "for" exprlist "in" testlist ":" suite ["else" ":" suite]
try_stmt: "try" ":" suite except_clauses ["else" ":" suite] [finally]
        | "try" ":" suite finally   -> try_finally
finally: "finally" ":" suite
except_clauses: except_clause+
except_clause: "except" [test ["as" name]] ":" suite
// NB compile.c makes sure that the default except clause is last


with_stmt: "with" with_items ":" suite
with_items: with_item ("," with_item)*
with_item: test ["as" name]

match_stmt: "match" test ":" _NEWLINE _INDENT case+ _DEDENT

case: "case" pattern ["if" test] ":" suite

?pattern: sequence_item_pattern "," _sequence_pattern -> sequence_pattern
        | as_pattern
?as_pattern: or_pattern ("as" NAME)?
?or_pattern: closed_pattern ("|" closed_pattern)*
?closed_pattern: literal_pattern
               | NAME -> capture_pattern
               | "_" -> any_pattern
               | attr_pattern
               | "(" as_pattern ")"
               | "[" _sequence_pattern "]" -> sequence_pattern
               | "(" (sequence_item_pattern "," _sequence_pattern)? ")" -> sequence_pattern
               | "{" (mapping_item_pattern ("," mapping_item_pattern)* ","?)?"}" -> mapping_pattern
               | "{" (mapping_item_pattern ("," mapping_item_pattern)* ",")? "**" NAME ","? "}" -> mapping_star_pattern
               | class_pattern

literal_pattern: inner_literal_pattern

?inner_literal_pattern: "None" -> const_none
                      | "True" -> const_true
                      | "False" -> const_false
                      | STRING -> string
                      | number

attr_pattern: NAME ("." NAME)+ -> value

name_or_attr_pattern: NAME ("." NAME)* -> value

mapping_item_pattern: (literal_pattern|attr_pattern) ":" as_pattern

_sequence_pattern: (sequence_item_pattern ("," sequence_item_pattern)* ","?)?
?sequence_item_pattern: as_pattern
                      | "*" NAME -> star_pattern

class_pattern: name_or_attr_pattern "(" [arguments_pattern ","?] ")"
arguments_pattern: pos_arg_pattern ["," keyws_arg_pattern]
                 | keyws_arg_pattern -> no_pos_arguments

pos_arg_pattern: as_pattern ("," as_pattern)*
keyws_arg_pattern: keyw_arg_pattern ("," keyw_arg_pattern)*
keyw_arg_pattern: NAME "=" as_pattern



suite: simple_stmt | _NEWLINE _INDENT stmt+ _DEDENT

?test: or_test ("if" or_test "else" test)?
     | lambdef
     | assign_expr

assign_expr: name ":=" test

?test_nocond: or_test | lambdef_nocond

?or_test: and_test ("or" and_test)*
?and_test: not_test_ ("and" not_test_)*
?not_test_: "not" not_test_ -> not_test
         | comparison
?comparison: expr (comp_op expr)*
star_expr: "*" expr

?expr: or_expr
?or_expr: xor_expr ("|" xor_expr)*
?xor_expr: and_expr ("^" and_expr)*
?and_expr: shift_expr ("&" shift_expr)*
?shift_expr: arith_expr (_shift_op arith_expr)*
?arith_expr: term (_add_op term)*
?term: factor (_mul_op factor)*
?factor: _unary_op factor | power

!_unary_op: "+"|"-"|"~"
!_add_op: "+"|"-"
!_shift_op: "<<"|">>"
!_mul_op: "*"|"@"|"/"|"%"|"//"
// <> isn't actually a valid comparison operator in Python. It's here for the
// sake of a __future__ import described in PEP 401 (which really works :-)
!comp_op: "<"|">"|"=="|">="|"<="|"<>"|"!="|"in"|"not" "in"|"is"|"is" "not"

?power: await_expr ("**" factor)?
?await_expr: AWAIT? atom_expr
AWAIT: "await"

?atom_expr: atom_expr "(" [arguments] ")"      -> funccall
          | atom_expr "[" subscriptlist "]"  -> getitem
          | atom_expr "." name               -> getattr
          | atom

?atom: "(" yield_expr ")"
     | "(" _tuple_inner? ")" -> tuple
     | "(" comprehension{test_or_star_expr} ")" -> tuple_comprehension
     | "[" _exprlist? "]"  -> list
     | "[" comprehension{test_or_star_expr} "]"  -> list_comprehension
     | "{" _dict_exprlist? "}" -> dict
     | "{" comprehension{key_value} "}" -> dict_comprehension
     | "{" _exprlist "}" -> set
     | "{" comprehension{test} "}" -> set_comprehension
     | name -> var
     | number
     | string_concat
     | "(" test ")"
     | "..." -> ellipsis
     | "None"    -> const_none
     | "True"    -> const_true
     | "False"   -> const_false


?string_concat: string+

_tuple_inner: test_or_star_expr (("," test_or_star_expr)+ [","] | ",")

?test_or_star_expr: test
                 | star_expr

?subscriptlist: subscript
              | subscript (("," subscript)+ [","] | ",") -> subscript_tuple
?subscript: test | ([test] ":" [test] [sliceop]) -> slice
sliceop: ":" [test]
?exprlist: (expr|star_expr)
         | (expr|star_expr) (("," (expr|star_expr))+ [","]|",")
?testlist: test | testlist_tuple
testlist_tuple: test (("," test)+ [","] | ",")
_dict_exprlist: (key_value | "**" expr) ("," (key_value | "**" expr))* [","]

key_value: test ":"  test

_exprlist: test_or_star_expr (","  test_or_star_expr)* [","]

classdef: "class" name ["(" [arguments] ")"] ":" suite



arguments: argvalue ("," argvalue)*  ("," [ starargs | kwargs])?
         | starargs
         | kwargs
         | comprehension{test}

starargs: stararg ("," stararg)* ("," argvalue)* ["," kwargs]
stararg: "*" test
kwargs: "**" test ("," argvalue)*

?argvalue: test ("=" test)?


comprehension{comp_result}: comp_result comp_fors [comp_if]
comp_fors: comp_for+
comp_for: [ASYNC] "for" exprlist "in" or_test
ASYNC: "async"
?comp_if: "if" test_nocond

// not used in grammar, but may appear in "node" passed from Parser to Compiler
encoding_decl: name

yield_expr: "yield" [testlist]
          | "yield" "from" test -> yield_from

number: DEC_NUMBER | HEX_NUMBER | BIN_NUMBER | OCT_NUMBER | FLOAT_NUMBER | IMAG_NUMBER
string: STRING | LONG_STRING

// Other terminals

_NEWLINE: ( /\r?\n[\t ]*/ | COMMENT )+

%ignore /[\t \f]+/  // WS
%ignore /\\[\t \f]*\r?\n/   // LINE_CONT
%ignore COMMENT
%declare _INDENT _DEDENT


// Python terminals

!name: NAME | "match" | "case"
NAME: /[^\W\d]\w*/
COMMENT: /#[^\n]*/

STRING: /([ubf]?r?|r[ubf])("(?!"").*?(?<!\\)(\\\\)*?"|'(?!'').*?(?<!\\)(\\\\)*?')/i
LONG_STRING: /([ubf]?r?|r[ubf])(""".*?(?<!\\)(\\\\)*?"""|'''.*?(?<!\\)(\\\\)*?''')/is

_SPECIAL_DEC: "0".."9"        ("_"?  "0".."9"                       )*
DEC_NUMBER:   "1".."9"        ("_"?  "0".."9"                       )*
          |   "0"             ("_"?  "0"                            )* /(?![1-9])/
HEX_NUMBER.2: "0" ("x" | "X") ("_"? ("0".."9" | "a".."f" | "A".."F"))+
OCT_NUMBER.2: "0" ("o" | "O") ("_"?  "0".."7"                       )+
BIN_NUMBER.2: "0" ("b" | "B") ("_"?  "0".."1"                       )+

_EXP: ("e"|"E") ["+" | "-"] _SPECIAL_DEC
DECIMAL: "." _SPECIAL_DEC | _SPECIAL_DEC "." _SPECIAL_DEC?
FLOAT_NUMBER.2: _SPECIAL_DEC _EXP | DECIMAL _EXP?
IMAG_NUMBER.2: (_SPECIAL_DEC      | FLOAT_NUMBER) ("J" | "j")


// Comma-separated list (with an optional trailing comma)
cs_list{item}: item ("," item)* ","?
_cs_list{item}: item ("," item)* ","?
```
