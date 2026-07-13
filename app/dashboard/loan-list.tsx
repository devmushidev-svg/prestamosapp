'use client'

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, RotateCcw, Trash2, Calendar, User } from 'lucide-react'
import { toggleLoanStatus, deleteLoan } from './actions'

export type Loan = {
  id: string
  debtor_name: string
  amount: number
  due_date: string | null
  status: string
  created_at: string
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value || 0)
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function LoanRow({ loan }: { loan: Loan }) {
  const [isPending, startTransition] = useTransition()
  const isPaid = loan.status === 'paid'

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {loan.debtor_name}
            </span>
            <Badge variant={isPaid ? 'secondary' : 'default'}>
              {isPaid ? 'Pagado' : 'Pendiente'}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {formatCurrency(loan.amount)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(loan.due_date)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                toggleLoanStatus(loan.id, loan.status)
              })
            }
          >
            {isPaid ? (
              <>
                <RotateCcw className="mr-1 h-4 w-4" />
                Marcar pendiente
              </>
            ) : (
              <>
                <Check className="mr-1 h-4 w-4" />
                Marcar pagado
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label="Eliminar préstamo"
            onClick={() =>
              startTransition(() => {
                deleteLoan(loan.id)
              })
            }
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function LoanList({ loans }: { loans: Loan[] }) {
  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aún no tienes préstamos registrados. Agrega el primero arriba.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {loans.map((loan) => (
        <LoanRow key={loan.id} loan={loan} />
      ))}
    </div>
  )
}
