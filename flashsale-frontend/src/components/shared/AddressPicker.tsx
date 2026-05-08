'use client'

import { useEffect } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useGHNProvinces, useGHNDistricts, useGHNWards } from '@/hooks/queries/useGHNAddress'

export interface StructuredAddress {
  to_name: string
  to_phone: string
  to_address: string
  to_ward_code: string
  to_ward_name: string
  to_district_id: number
  to_district_name: string
  to_province_id: number
  to_province_name: string
}

interface AddressPickerProps {
  provinceId: number | null
  districtId: number | null
  wardCode: string | null
  streetAddress: string
  onProvinceChange: (id: number | null, name: string) => void
  onDistrictChange: (id: number | null, name: string) => void
  onWardChange: (code: string | null, name: string) => void
  onStreetAddressChange: (value: string) => void
  errors?: {
    province?: string
    district?: string
    ward?: string
    streetAddress?: string
  }
}

function SelectField({
  value,
  placeholder,
  loading,
  disabled,
  children,
  onChange,
  error
}: {
  value: string
  placeholder: string
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <div className="relative">
      <div className="relative">
        <select
          value={value}
          disabled={disabled || loading}
          onChange={e => onChange(e.target.value)}
          className="input-glass w-full appearance-none pr-8 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">{placeholder}</option>
          {children}
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/40">
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ChevronDown size={14} />
          )}
        </div>
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

export function AddressPicker({
  provinceId,
  districtId,
  wardCode,
  streetAddress,
  onProvinceChange,
  onDistrictChange,
  onWardChange,
  onStreetAddressChange,
  errors
}: AddressPickerProps) {
  const { data: provinces, loading: provincesLoading } = useGHNProvinces()
  const { data: districts, loading: districtsLoading } = useGHNDistricts(provinceId)
  const { data: wards, loading: wardsLoading } = useGHNWards(districtId)

  // Reset downstream selections when parent changes
  useEffect(() => {
    onDistrictChange(null, '')
    onWardChange(null, '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinceId])

  useEffect(() => {
    onWardChange(null, '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtId])

  const handleProvinceChange = (value: string) => {
    const id = value ? parseInt(value, 10) : null
    const name = provinces.find(p => p.ProvinceID === id)?.ProvinceName ?? ''
    onProvinceChange(id, name)
  }

  const handleDistrictChange = (value: string) => {
    const id = value ? parseInt(value, 10) : null
    const name = districts.find(d => d.DistrictID === id)?.DistrictName ?? ''
    onDistrictChange(id, name)
  }

  const handleWardChange = (value: string) => {
    const name = wards.find(w => w.WardCode === value)?.WardName ?? ''
    onWardChange(value || null, name)
  }

  return (
    <div className="space-y-3">
      {/* Province */}
      <SelectField
        value={provinceId ? String(provinceId) : ''}
        placeholder="Chọn tỉnh/thành phố"
        loading={provincesLoading}
        onChange={handleProvinceChange}
        error={errors?.province}
      >
        {provinces.map(p => (
          <option key={p.ProvinceID} value={p.ProvinceID}>
            {p.ProvinceName}
          </option>
        ))}
      </SelectField>

      {/* District */}
      <SelectField
        value={districtId ? String(districtId) : ''}
        placeholder={provinceId ? 'Chọn quận/huyện' : 'Chọn tỉnh/thành phố trước'}
        loading={districtsLoading}
        disabled={!provinceId}
        onChange={handleDistrictChange}
        error={errors?.district}
      >
        {districts.map(d => (
          <option key={d.DistrictID} value={d.DistrictID}>
            {d.DistrictName}
          </option>
        ))}
      </SelectField>

      {/* Ward */}
      <SelectField
        value={wardCode ?? ''}
        placeholder={districtId ? 'Chọn phường/xã' : 'Chọn quận/huyện trước'}
        loading={wardsLoading}
        disabled={!districtId}
        onChange={handleWardChange}
        error={errors?.ward}
      >
        {wards.map(w => (
          <option key={w.WardCode} value={w.WardCode}>
            {w.WardName}
          </option>
        ))}
      </SelectField>

      {/* Street address */}
      <div>
        <input
          type="text"
          value={streetAddress}
          onChange={e => onStreetAddressChange(e.target.value)}
          placeholder="Số nhà, tên đường (ví dụ: 123 Nguyễn Huệ)"
          className="input-glass w-full"
        />
        {errors?.streetAddress && (
          <p className="text-red-400 text-xs mt-1">{errors.streetAddress}</p>
        )}
      </div>
    </div>
  )
}
