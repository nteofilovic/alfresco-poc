import { useEffect, useState } from 'react'
import { api, type SpaceMember } from '../api'
import { apiErrorMessage, initials } from '../formatters'
import { roleLabel } from '../spaceRoles'
import { Spinner } from './Spinner'

/** Command-bar layout, Members tab of a space (admins only: the member list is an admin endpoint). Read-only; changes are made in Administration. */
export function SpaceMembers({ spaceId }: { spaceId: string }) {
  const [members, setMembers] = useState<SpaceMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listSpaceMembers(spaceId)
      .then((m) => !cancelled && setMembers([...m].sort((a, b) => a.displayName.localeCompare(b.displayName))))
      .catch((e) => !cancelled && setError(apiErrorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [spaceId])

  if (error) return <p className="space-members-note">Couldn’t load the members. {error}</p>
  if (!members) return <Spinner size={18} label="Loading members…" />
  if (members.length === 0) return <p className="space-members-note">This space has no members yet.</p>

  return (
    <div className="sheet">
      <table className="node-table member-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.username}>
              <td>
                <span className="owner">
                  <span className="avatar avatar-muted avatar-xs" aria-hidden="true">
                    {initials(m.displayName)}
                  </span>
                  {m.displayName}
                </span>
              </td>
              <td className="muted-cell">{m.username}</td>
              <td>{roleLabel(m.role)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
