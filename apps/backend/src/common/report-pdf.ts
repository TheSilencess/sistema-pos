export function reportPdf(lines: string[]): Buffer {
  // Paginate complete record blocks so a sale or a cash close stays together.
  const title = lines[0] || 'Reporte';
  const header = lines.slice(1, lines.indexOf('') > 0 ? lines.indexOf('') : 2);
  const body = lines.slice(1 + header.length).filter((s,i,a)=>!(i===0 && s===''));
  const blocks: string[][]=[]; let block:string[]=[];
  for(const line of body){if(!line){if(block.length)blocks.push(block);block=[];}else block.push(line);}
  if(block.length)blocks.push(block);
  const pages:string[][]=[];let page:string[]=[];
  for(const b of blocks){if(page.length+b.length+1>29 && page.length){pages.push(page);page=[];}if(b.length>29){for(const line of b){if(page.length===29){pages.push(page);page=[];}page.push(line);}}else page.push(...b,'');}
  if(page.length || !pages.length)pages.push(page);
  const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const kids: string[] = [];
  pages.forEach((page, index) => {
    const id = objects.length + 1; kids.push(`${id} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id+1} 0 R >>`);
    const escape = (s: string) => s.replace(/[\\()]/g, '\\$&').replace(/[\r\n]/g, ' ').replace(/[^\x20-\xFF]/g, '?');
    const commands:string[]=[];
    const rect=(x:number,y:number,w:number,h:number,color:string)=>commands.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
    const text=(s:string,x:number,y:number,size=10,bold=false,color='0.16 0.19 0.18')=>commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${escape(s)}) Tj ET`);
    rect(0,710,595,132,'0.09 0.15 0.28');rect(40,744,4,56,'0.82 0.65 0.34');
    text('TUTIMAMI / INFORMACION DEL NEGOCIO',56,799,9,true,'0.83 0.75 0.60');
    text(title.replace('TutiMami - ',''),56,769,25,true,'1 1 1');
    text('Control de ventas y cuadre de caja',56,742,10,false,'0.74 0.79 0.76');
    rect(40,585,515,103,'0.96 0.95 0.92');
    header.slice(0,5).forEach((s,i)=>text(s,56,671-i*17,i?11:10,i>0));
    text('DETALLE DEL PERIODO',40,560,9,true,'0.49 0.43 0.32');
    let y=537;let groupStart=true;
    for(const line of page){
      if(!line){y-=9;groupStart=true;continue;}
      if(groupStart){rect(40,y-5,515,19,'0.94 0.95 0.94');text(line.slice(0,89),50,y+1,10,true);groupStart=false;}
      else text(line.slice(0,100),50,y+1,9);
      y-=13;
    }
    if(!page.length)text('No hay registros para el periodo seleccionado.',50,535,11);
    commands.push('0.84 0.85 0.84 RG 0.5 w 40 56 m 555 56 l S');
    text('TutiMami POS | Moneda: quetzales (GTQ)',40,38,8,false,'0.45 0.48 0.46');
    text(`Pagina ${index+1} de ${pages.length}`,470,38,8,false,'0.45 0.48 0.46');
    const stream=commands.join('\n');
    objects.push(`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj,i) => {offsets.push(Buffer.byteLength(out,'latin1')); out += `${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref = Buffer.byteLength(out,'latin1');
  out += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n` + offsets.slice(1).map(v=>`${String(v).padStart(10,'0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out,'latin1');
}
