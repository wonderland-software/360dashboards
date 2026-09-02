#!/usr/bin/env python3
"""Decode Xbox 360 dashboard ScriptScene bytecode (.scb).

Grammar recovered from the interpreter in the decrypted dashboard executable
(extracted/6770/basefile.exe, .text VA 0x9210c000):

  ParseScript      0x9258f6b8   version byte, string table, statement list
  ReadStringTable  0x9258ee28   varint count, then varint-length ASCII strings
  ReadVarint       inline       b < 0x80 ? b : ((b & 0x7f) << 8) | next
  ReadStringIndex  0x9258efb8   varint index into the string table
  ReadValue        0x9258f008   typed literal + "kind" byte + optional arg list
  ReadNode         0x9258f2b8   expression node (tags 1, 2, 7, 8, 9, other)
  ReadStatement    0x9258f588   statement kind + optional name + child nodes
  ReadPathSegment  0x9258f248   (name, node) pair inside a path node

Usage:  python3 reference/scb/scb-decode.py <file.scb> [...]
        python3 reference/scb/scb-decode.py --raw <file.scb>    # annotated tree
"""
import sys, struct

# ---------------------------------------------------------------- reader

class R:
    def __init__(self, b):
        self.b = b
        self.p = 0
    def u8(self):
        v = self.b[self.p]; self.p += 1; return v
    def varint(self):
        # 0x9258ee38 / 0x9258efb8: high bit of the first byte means a second
        # byte follows;  value = ((b0 & 0x7f) << 8) | b1, masked to 16 bits.
        b0 = self.u8()
        if b0 & 0x80:
            b1 = self.u8()
            return (((b0 & 0x7f) << 8) | b1) & 0xffff
        return b0
    def i32(self):
        v = struct.unpack_from('>I', self.b, self.p)[0]; self.p += 4
        return v - 0x100000000 if v & 0x80000000 else v
    def i64(self):
        v = struct.unpack_from('>Q', self.b, self.p)[0]; self.p += 8
        return v

# ---------------------------------------------------------------- AST

class Value:
    """ReadValue @0x9258f008 -> {vtype, literal, kind, args:[(name, node|None)]}"""
    def __init__(s): s.vtype = 0; s.lit = None; s.kind = 0; s.args = []

class Node:
    """ReadNode @0x9258f2b8"""
    def __init__(s): s.tag = 0; s.neg = False; s.value = None; s.segs = []
    # tag 1/8: op, lhs, rhs (+ then/else statements for tag 1)
    # tag 9:   name, value, body
    # tag 2:   value
    # other:   segs = [(name, Node)]

class Stmt:
    """ReadStatement @0x9258f588"""
    def __init__(s): s.kind = 0; s.name = None; s.args = []


class Script:
    def __init__(s): s.strings = []; s.stmts = []


def read_value(r, S):
    v = Value()
    v.vtype = r.u8()
    if v.vtype in (1, 2):
        v.lit = r.i32()
    elif v.vtype == 5:
        v.lit = r.i64()
    elif v.vtype == 4:
        v.lit = S.strings[r.varint()]
    v.kind = r.u8()
    if v.kind == 3:
        n = r.u8()
        for _ in range(n):
            nm = S.strings[r.varint()]
            has = r.u8()
            v.args.append((nm, read_node(r, S) if has else None))
    return v


def read_node(r, S):
    n = Node()
    t = r.u8()
    if t == 1:                              # if (lhs OP rhs) then [else]
        n.tag = 1
        n.op = r.u8()
        n.lhs = read_node(r, S)
        n.rhs = read_node(r, S)
        n.then = read_stmt(r, S)
        n.els = read_stmt(r, S) if r.u8() else None
        return n
    if t == 8:                              # binary expression
        n.tag = 8
        n.op = r.u8()
        n.lhs = read_node(r, S)
        n.rhs = read_node(r, S)
        return n
    if t == 9:                              # named block with a value + body
        n.tag = 9
        n.name = S.strings[r.varint()]
        n.value = read_value(r, S)
        n.body = read_stmt(r, S)
        return n
    if t == 7:                              # "not" prefix, real tag follows
        n.neg = True
        t = r.u8()
    n.tag = t
    if t == 2:
        n.value = read_value(r, S)
    else:
        for _ in range(r.varint()):
            nm = S.strings[r.varint()]
            sub = read_node(r, S)
            n.segs.append((nm, sub))
    return n


def read_stmt(r, S):
    st = Stmt()
    st.kind = r.u8()
    if st.kind not in (0, 1, 2, 3):
        st.name = S.strings[r.varint()]
    for _ in range(r.varint()):
        st.args.append(read_node(r, S))
    return st


def parse(data):
    r = R(data)
    S = Script()
    ver = r.u8()
    assert ver == 2, f'unexpected version {ver}'
    for _ in range(r.varint()):
        n = r.varint()
        S.strings.append(data[r.p:r.p + n].decode('latin1'))
        r.p += n
    for _ in range(r.varint()):
        S.stmts.append(read_stmt(r, S))
    S.end = r.p
    S.size = len(data)
    return S

# ---------------------------------------------------------------- printing

# Statement kinds (the byte at the head of every statement).
#  code = proved in the interpreter; data = inferred from the five scripts.
STMT = {
    0x00: ('block',      'data'),   # bare statement list
    0x01: ('then',       'data'),   # body of an "if" node
    0x02: ('else',       'data'),   # plain else body of an "if" node
    0x03: ('elseif',     'data'),   # else body whose only child is another if
    0x04: ('proc',       'code'),   # named procedure  (0x9258e290 passes kind 4
                                    # with the name taken from a call node's
                                    # "proc" key)
    0x05: ('onload',     'data'),   # named after the ScriptScene id; holds the
                                    # data-source / DataAssociation bindings
    0x06: ('onselect',   'data'),   # named after a list element
    0x07: ('onpress',    'data'),   # named after a button / legend element
    0x0b: ('ontimer',    'data'),   # scene-named; body calls native KillTimer
    0x0c: ('onchanged',  'data'),   # named after a data / twist element
    0x0e: ('ontrans',    'data'),   # scene-named; reads $TransType
    0x0f: ('ontransend', 'data'),   # scene-named; reads $TransType
}

OPS = {0: '==', 1: '!=', 2: '<', 3: '>', 4: '<=', 5: '>=', 6: '&&', 7: '||'}

# Node tags (the byte at the head of every expression node).
TAGN = {2: 'value', 3: 'call', 4: 'assign', 5: 'read', 6: 'page', 10: 'format'}


def fmt_value(v):
    if v.kind == 3:                       # qualified path: data.Field
        return '.'.join(nm + ('[' + fmt_node(sub) + ']' if sub is not None else '')
                        for nm, sub in v.args)
    if v.vtype == 4:
        s = '"%s"' % v.lit
    elif v.vtype in (1, 2, 5):
        s = str(v.lit)
    elif v.vtype == 0:
        s = 'null'
    else:
        s = '<vtype%d>' % v.vtype
    if v.kind == 1:                       # named parameter / variable
        return '$' + v.lit if v.vtype == 4 else '$' + s
    if v.kind != 0:
        s += '[k%d]' % v.kind
    return s


def seg(n, name):
    for nm, sub in n.segs:
        if nm == name:
            return sub
    return None


def fmt_node(n, ind=0):
    p = '!' if n.neg else ''
    if n.tag == 2:
        return p + fmt_value(n.value)
    if n.tag == 8:
        return '%s(%s %s %s)' % (p, fmt_node(n.lhs), OPS.get(n.op, 'op%d' % n.op),
                                 fmt_node(n.rhs))
    if n.tag == 1:
        s = '%sif (%s %s %s) {\n' % (p, fmt_node(n.lhs),
                                     OPS.get(n.op, 'op%d' % n.op), fmt_node(n.rhs))
        s += fmt_stmt(n.then, ind + 1)
        if n.els is not None and (n.els.args or n.els.kind not in (0, 3)):
            s += '\n' + '  ' * ind + '} else {\n' + fmt_stmt(n.els, ind + 1)
        return s + '\n' + '  ' * ind + '}'
    if n.tag == 9:
        return '%sforeach %s in %s {\n%s\n%s}' % (p, n.name, fmt_value(n.value),
                                                  fmt_stmt(n.body, ind + 1),
                                                  '  ' * ind)
    if n.tag == 4:                        # elem.prop = value
        e, pr, v = seg(n, 'elem'), seg(n, 'prop'), seg(n, 'value')
        if e is not None and pr is not None and v is not None and len(n.segs) == 3:
            return '%s%s.%s = %s' % (p, fmt_node(e), fmt_node(pr), fmt_node(v))
    if n.tag == 5:                        # elem.prop
        e, pr = seg(n, 'elem'), seg(n, 'prop')
        if e is not None and pr is not None and len(n.segs) == 2:
            return '%s%s.%s' % (p, fmt_node(e), fmt_node(pr))
    if n.tag == 10:                       # format("fmt", a, b)
        f = seg(n, 'string')
        args = [fmt_node(s) for nm, s in n.segs if nm == 'value']
        if f is not None:
            return '%sformat(%s%s)' % (p, fmt_node(f),
                                       ''.join(', ' + a for a in args))
    if n.tag in (3, 6):                   # call / page navigation
        head = None
        rest = []
        for nm, sub in n.segs:
            if head is None and nm in ('native', 'proc', 'script', 'page'):
                head = '%s %s' % (nm, fmt_node(sub))
            else:
                rest.append('%s=%s' % (nm, fmt_node(sub)))
        if head is not None:
            return '%s%s(%s)' % (p, head, ', '.join(rest))
    body = ' '.join('%s=%s' % (nm, fmt_node(s, ind)) for nm, s in n.segs)
    return '%s%s{%s}' % (p, TAGN.get(n.tag, 'tag%d' % n.tag), body)


def fmt_stmt(st, ind=0):
    pad = '  ' * ind
    kw = STMT.get(st.kind, ('stmt%02x' % st.kind, 'guess'))[0]
    if st.kind in (0, 1, 2, 3):
        head = None
    else:
        head = '%s %s' % (kw, st.name)
    lines = []
    if head:
        lines.append(pad + head + ':')
        ind += 1
        pad = '  ' * ind
    for a in st.args:
        lines.append(pad + fmt_node(a, ind))
    if not lines:
        lines.append(pad + '(empty)')
    return '\n'.join(lines)


def dump(path):
    S = parse(open(path, 'rb').read())
    print('== %s' % path)
    print('   %d strings, %d statements, consumed %d/%d bytes%s'
          % (len(S.strings), len(S.stmts), S.end, S.size,
             '  OK' if S.end == S.size else '  *** MISMATCH ***'))
    for st in S.stmts:
        print(fmt_stmt(st, 1))
        print()
    return S.end == S.size


if __name__ == '__main__':
    ok = True
    for f in sys.argv[1:]:
        ok &= dump(f)
    sys.exit(0 if ok else 1)
