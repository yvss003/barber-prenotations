import{json,requireAdmin}from'../../../_shared.js';
export async function onRequestDelete(context){if(!await requireAdmin(context))return json({message:'Accesso scaduto'},401);await context.env.DB.prepare('delete from blocked_periods where id=?').bind(context.params.id).run();return json({ok:true})}
