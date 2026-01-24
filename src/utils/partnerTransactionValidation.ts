import { isPeriodBlocked } from "./periodValidation";

/**
 * Verifica bloqueios para o módulo de Aportes e Retiradas
 */
export const validatePartnerTransactionPeriod = {
  /**
   * Valida se a competência não está bloqueada para cadastro
   */
  competencia: async (competenceDate: Date | string): Promise<{ blocked: boolean; message?: string }> => {
    const blocked = await isPeriodBlocked(competenceDate, 'competencia', 'financeiro');
    
    let year: number;
    let month: number;
    
    if (typeof competenceDate === 'string') {
      const parts = competenceDate.split('-');
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
    } else {
      year = competenceDate.getUTCFullYear();
      month = competenceDate.getUTCMonth() + 1;
    }
    
    return {
      blocked,
      message: blocked 
        ? `O período ${month}/${year} está bloqueado para cadastro de competência em Aportes e Retiradas.`
        : undefined
    };
  },

  /**
   * Valida se o pagamento não está bloqueado
   */
  pagamento: async (paymentDate: Date | string): Promise<{ blocked: boolean; message?: string }> => {
    const blocked = await isPeriodBlocked(paymentDate, 'pagamento', 'financeiro');
    
    let year: number;
    let month: number;
    
    if (typeof paymentDate === 'string') {
      const parts = paymentDate.split('-');
      year = parseInt(parts[0]);
      month = parseInt(parts[1]);
    } else {
      year = paymentDate.getUTCFullYear();
      month = paymentDate.getUTCMonth() + 1;
    }
    
    return {
      blocked,
      message: blocked 
        ? `O período ${month}/${year} está bloqueado para pagamentos em Aportes e Retiradas.`
        : undefined
    };
  }
};
