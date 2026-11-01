// "1 message", "2 messages", "0 records": a count with its noun in the right number.
export const count=(n,one,many=`${one}s`)=>`${n} ${n===1?one:many}`;
