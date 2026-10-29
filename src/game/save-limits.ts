/** A transport/resource guard, not a career-length rule. Detailed sources are retained. */
export const MAX_SAVE_BYTES = 1024 * 1024 * 1024;
export function utf8Size(text:string):number {
 let bytes=0;
 for(let i=0;i<text.length;i++){
  const code=text.charCodeAt(i);
  if(code<128)bytes++;else if(code<2048)bytes+=2;
  else if(code>=0xd800&&code<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}
  else bytes+=3;
 }
 return bytes;
}
