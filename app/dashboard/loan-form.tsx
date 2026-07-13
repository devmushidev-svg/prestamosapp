'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Plus } from 'lucide-react'
import { createLoan } from './actions'

export function LoanForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await createLoan(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        formRef.current?.reset()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Nuevo préstamo</CardTitle>
        <CardDescription>Registra a quién le prestaste dinero</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="debtor_name">Nombre del deudor</Label>
            <Input
              id="debtor_name"
              name="debtor_name"
              placeholder="Ej. Juan Pérez"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="amount">Monto</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="due_date">Fecha de vencimiento</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" />
            {isPending ? 'Guardando...' : 'Agregar préstamo'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
