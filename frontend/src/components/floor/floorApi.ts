import { api } from '@/lib/api'

import type { Seat, SeatAssignment, SeatDefectReport, SeatKit } from './floorTypes'

/** Every seat mutation is server-authoritative: the backend re-derives the
 *  status and returns the row, and the page refetches the floor afterwards. */
export const floorApi = {
  listSeats: () => api.get<Seat[]>('/api/seats'),

  assign: (seatId: string, assignment: SeatAssignment) =>
    api.post<Seat>(`/api/seats/${seatId}/assign`, { assignment }),

  release: (seatId: string) => api.post<Seat>(`/api/seats/${seatId}/release`, {}),

  unassign: (seatId: string) => api.post<Seat>(`/api/seats/${seatId}/unassign`, {}),

  updateNote: (seatId: string, note: string | null) =>
    api.patch<Seat>(`/api/seats/${seatId}/note`, { note }),

  updateEquipment: (seatId: string, kit: SeatKit, present: boolean) =>
    api.patch<Seat>(
      `/api/seats/${seatId}/equipment`,
      kit === 'dock' ? { hasDock: present } : { hasTerminal: present },
    ),

  reportDefect: (seatId: string, reason: string) =>
    api.post<SeatDefectReport>(`/api/seats/${seatId}/reports`, { reason }),

  listDefectReports: (status: 'open' | 'closed') =>
    api.get<SeatDefectReport[]>(`/api/seats/reports?status=${status}`),

  closeDefectReport: (reportId: string, resolutionNote: string | null) =>
    api.post<SeatDefectReport>(`/api/seats/reports/${reportId}/close`, { resolutionNote }),
}
