import { request } from './client'
import type { AddBucketListItemInput, BucketListItem } from '../types/travel'

export function listBucketListItems(): Promise<BucketListItem[]> {
  return request<BucketListItem[]>('/api/bucket-list')
}

export function addBucketListItem(input: AddBucketListItemInput): Promise<BucketListItem> {
  return request<BucketListItem>('/api/bucket-list', { method: 'POST', body: JSON.stringify(input) })
}

export function deleteBucketListItem(itemId: string): Promise<void> {
  return request<void>(`/api/bucket-list/${itemId}`, { method: 'DELETE' })
}
