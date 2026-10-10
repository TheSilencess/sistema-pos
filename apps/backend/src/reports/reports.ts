import {Response} from 'express';
import {periodRange,paymentTotals,cents} from '../common/cash-math';
import {reportPdf} from '../common/report-pdf';
import {BadRequestException,Controller,Get,Query,Res,UseGuards}from'@nestjs/common';import {PrismaService}from'../common/prisma.service';import {AuthGuard}from'../common/auth.guard';import {Permission}from'../common/auth.decorators';@Controller('reports')@UseGuards(AuthGuard)export class ReportsController{constructor(private p:PrismaService){}@Get('dashboard')@Permission('reports.view')async dashboard(){const now=new Date();const start=new Date(now);start.setHours(0,0,0,0);const month=new Date(now.getFullYear(),now.getMonth(),1);const [today,monthSales,count,products,customers,latest,top]=await Promise.all([this.p.sale.aggregate({where:{createdAt:{gte:start},status:{not:'CANCELLED'}},_sum:{total:true}}),this.p.sale.aggregate({where:{createdAt:{gte:month},status:{not:'CANCELLED'}},_sum:{total:true}}),this.p.sale.count({where:{createdAt:{gte:month},status:{not:'CANCELLED'}}}),this.p.product.count({where:{active:true}}),this.p.customer.count({where:{active:true}}),this.p.sale.findMany({where:{status:{not:'CANCELLED'}},include:{customer:true},orderBy:{createdAt:'desc'},take:8}),this.p.saleItem.groupBy({by:['productId','productName'],_sum:{quantity:true,total:true},orderBy:{_sum:{quantity:'desc'}},take:8})]);const lowReal=await this.p.$queryRawUnsafe(`SELECT id,sku,name,stock,"minStock" FROM "Product" WHERE active=true AND stock<="minStock" ORDER BY stock ASC LIMIT 8`);return {today:Number(today._sum.total||0),month:Number(monthSales._sum.total||0),salesCount:count,products,customers,lowStock:lowReal,latestSales:latest,topProducts:top}}async reportSales(period?:string,date?:string){let range;try{range=periodRange(period,date);}catch(e:any){throw new BadRequestException(e.message);}return this.p.sale.findMany({where:{status:{not:'CANCELLED'},createdAt:range},include:{user:{select:{name:true}},customer:true,payments:true,items:true,cashSession:true},orderBy:{createdAt:'desc'}});}
@Get('sales') @Permission('reports.view') sales(@Query('period')p?:string,@Query('date')d?:string){return this.reportSales(p,d);}
@Get('sales/pdf') @Permission('reports.view') async pdf(@Query('period')p:string,@Query('date')d:string,@Res()res:Response){
 const sales=await this.reportSales(p,d);
 let range;try{range=periodRange(p,d);}catch(e:any){throw new BadRequestException(e.message);}
 const sessions=await this.p.cashSession.findMany({where:{OR:[{openedAt:{lt:range.lt,gte:range.gte}},{AND:[{openedAt:{lt:range.lt}},{OR:[{closedAt:null},{closedAt:{gte:range.gte}}]}]}]},include:{user:{select:{name:true}},sales:{include:{payments:true}}},orderBy:{openedAt:'asc'}});
 const q=(v:any)=>`Q ${Number(v||0).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const dt=(v:Date)=>new Date(v).toLocaleString('es-GT',{timeZone:'America/Guatemala'});
 const t=paymentTotals(sales);
 const lines=['TutiMami - Reporte de ventas y caja',`Periodo: ${p||'day'} / Fecha: ${d||'actual'} (Guatemala)`,`Ventas del periodo: ${t.count} / Total: ${q(t.total)}`,`Efectivo: ${q(t.CASH)} / Tarjeta: ${q(t.CARD)} / Transferencia: ${q(t.TRANSFER)}`,''];
 lines.push('DETALLE POR CAJA');
 if(!sessions.length) lines.push('No se registraron cajas en este periodo.','');
 let index=0;
 for(const session of sessions){
  index++;
  const sessionSales=sales.filter(s=>s.cashSessionId===session.id);
  const totals=paymentTotals(sessionSales);
  // El cierre almacenado corresponde al turno completo; para turnos abiertos
  // el efectivo se calcula sobre TODAS las ventas, no solo las filtradas.
  const allTotals=paymentTotals(session.sales);
  const initial=cents(session.openingCash);
  const expected=session.closedAt?cents(session.expectedCash):initial+cents(allTotals.CASH);
  lines.push(`CAJA ${index} - ${session.registerName} - ${session.user.name}`,
   `Apertura: ${dt(session.openedAt)} | Fondo inicial: ${q(session.openingCash)}`,
   `Estado: ${session.closedAt?'CERRADA':'ABIERTA'} | Cierre: ${session.closedAt?dt(session.closedAt):'Pendiente'}`,'');
  lines.push(`VENTAS DE CAJA ${index} (EN EL PERIODO)`);
  if(!sessionSales.length)lines.push('Sin ventas en el periodo.');
  for(let i=0;i<sessionSales.length;i++){
   const sale=sessionSales[i], st=paymentTotals([sale]);
   lines.push(`Venta ${i+1} | ${dt(sale.createdAt)} | ${sale.id.slice(0,12)} | Total ${q(sale.total)}`,
    `Efectivo: ${q(st.CASH)} | Tarjeta: ${q(st.CARD)} | Transferencia: ${q(st.TRANSFER)}`);
   for(const item of sale.items) lines.push(`  ${item.quantity} x ${String(item.productName).slice(0,42)} | ${q(item.total)}`);
  }
  lines.push('',`RESUMEN CAJA ${index}`,
   `Ventas del periodo: ${q(totals.total)} | Efectivo: ${q(totals.CASH)}`,
   `Tarjeta: ${q(totals.CARD)} | Transferencia: ${q(totals.TRANSFER)}`,
   `APERTURA: ${q(session.openingCash)} | EFECTIVO ESPERADO AL CIERRE: ${q(expected/100)}`,
   `EFECTIVO CONTADO: ${session.closedAt?q(session.countedCash):'Pendiente'}`,
   `DIFERENCIA: ${session.closedAt?q(session.difference):'Pendiente'}`,'');
 }
 const unassigned=sales.filter(s=>!s.cashSessionId || !sessions.some(x=>x.id===s.cashSessionId));
 if(unassigned.length){
  lines.push('VENTAS SIN CAJA EN EL REPORTE');
  for(const sale of unassigned){const st=paymentTotals([sale]);lines.push(`Venta ${sale.id.slice(0,12)} | ${dt(sale.createdAt)} | Total ${q(sale.total)}`,`Efectivo: ${q(st.CASH)} | Tarjeta: ${q(st.CARD)} | Transferencia: ${q(st.TRANSFER)}`,'');}
 }
 lines.push('TOTAL GENERAL DEL PERIODO',`Ventas: ${t.count} | Total vendido: ${q(t.total)}`,`Efectivo: ${q(t.CASH)} | Tarjeta: ${q(t.CARD)} | Transferencia: ${q(t.TRANSFER)}`,'');
 res.type('application/pdf').attachment('reporte-ventas.pdf').send(reportPdf(lines));
}}
