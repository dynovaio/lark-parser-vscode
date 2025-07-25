# Lark Grammar for Verilog

```lark
// Following https://www.verilog.com/VerilogBNF.html

// 1. Source Text
start: description*

?description: module

module: "module" name_of_module list_of_ports? ";" module_item* "endmodule"

?name_of_module: IDENTIFIER

list_of_ports: "(" port ("," port)* ")"

?port: IDENTIFIER

?module_item: input_declaration
            | output_declaration
            | net_declaration
            | module_instantiation
            | continuous_assign


// 2. Declarations
input_declaration: "input" list_of_variables ";"

output_declaration: "output" list_of_variables ";"

net_declaration: "wire" list_of_variables ";"

continuous_assign: "assign" list_of_assignments ";"

list_of_variables: IDENTIFIER ("," IDENTIFIER)*

list_of_assignments: assignment ("," assignment)*


// 3. Primitive Instances
// These are merged with module instantiations

// 4. Module Instantiations
module_instantiation: name_of_module module_instance ("," module_instance)* ";"

module_instance: name_of_instance "(" list_of_module_connections ")"

?name_of_instance: IDENTIFIER

list_of_module_connections: module_port_connection ("," module_port_connection)*
                          | named_port_connection ("," named_port_connection)*

module_port_connection: expression

named_port_connection: "." IDENTIFIER "(" expression ")"


// 5. Behavioral Statements
assignment: lvalue "=" expression


// 6. Specify Section


// 7. Expressions
?lvalue: identifier

expression: condition

?constant_value: constant_zero
               | constant_one
               | constant_x

constant_zero: "1'b0"
             | "1'h0"

constant_one: "1'b1"
            | "1'h1"

constant_x: "1'bx"
          | "1'hx"

?condition : or
           | ternary

?ternary: or "?" or ":" or

?or : xor
    | or_gate

?or_gate: or "|" xor

?xor : and
     | xor_gate
     | xnor_gate

?xor_gate: xor "^" and

?xnor_gate: xor "~^" and
          | xor "^~" and

?and : unary
     | and_gate

?and_gate: and "&" unary

?unary : primary
       | not_gate

not_gate: ( "!" | "~" ) primary

?primary : IDENTIFIER
         | constant_value
         | "(" or ")"


// 8. General
?identifier: IDENTIFIER

IDENTIFIER: CNAME
          | ESCAPED_IDENTIFIER


// Lark
ESCAPED_IDENTIFIER: /\\([^\s]+)/
COMMENT: "//" /[^\n]*/ NEWLINE
NEWLINE: "\n"
MULTILINE_COMMENT: /\/\*(\*(?!\/)|[^*])*\*\//

%import _common.CNAME
%import _common.ESCAPED_STRING
%import _common.WS

%ignore WS
%ignore COMMENT
%ignore MULTILINE_COMMENT
%ignore NEWLINE
```
