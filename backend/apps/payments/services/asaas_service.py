"""
Asaas API integration service with clean architecture.
"""
import httpx
from decimal import Decimal
from datetime import date, timedelta
from typing import Dict, Optional, List
from django.conf import settings
from django.utils import timezone


class AsaasAPIException(Exception):
    """Custom exception for Asaas API errors."""
    pass


class AsaasService:
    """
    Service for integrating with Asaas payment gateway.
    Handles customer creation, payment generation, and subscriptions.
    """
    
    def __init__(self):
        self.api_key = settings.ASAAS_API_KEY
        self.env = settings.ASAAS_ENV
        self.base_url = self._get_base_url()
        self.headers = {
            'access_token': self.api_key,
            'Content-Type': 'application/json'
        }
    
    def _get_base_url(self) -> str:
        """Get Asaas API base URL based on environment."""
        if self.env == 'production':
            return 'https://api.asaas.com/v3'
        return 'https://sandbox.asaas.com/api/v3'
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None
    ) -> Dict:
        """
        Make HTTP request to Asaas API.
        
        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint
            data: Request payload
            
        Returns:
            Response data as dictionary
            
        Raises:
            AsaasAPIException: If request fails
        """
        url = f'{self.base_url}/{endpoint}'
        
        try:
            with httpx.Client() as client:
                response = client.request(
                    method=method,
                    url=url,
                    headers=self.headers,
                    json=data,
                    timeout=30.0
                )
                
                if response.status_code >= 400:
                    error_data = response.json() if response.text else {}
                    raise AsaasAPIException(
                        f"Asaas API error: {response.status_code} - {error_data}"
                    )
                
                return response.json()
                
        except httpx.RequestError as e:
            raise AsaasAPIException(f"Request failed: {str(e)}")
    
    def create_customer(
        self,
        name: str,
        email: str,
        cpf_cnpj: str,
        phone: Optional[str] = None,
        postal_code: Optional[str] = None,
        address: Optional[str] = None,
        address_number: Optional[str] = None,
        province: Optional[str] = None
    ) -> Dict:
        """
        Create a customer in Asaas.
        
        Args:
            name: Customer full name
            email: Customer email
            cpf_cnpj: Customer CPF or CNPJ
            phone: Customer phone (optional)
            postal_code: ZIP code (optional)
            address: Street address (optional)
            address_number: Address number (optional)
            province: State/province (optional)
            
        Returns:
            Customer data with 'id' field
        """
        data = {
            'name': name,
            'email': email,
            'cpfCnpj': cpf_cnpj,
        }
        
        if phone:
            data['mobilePhone'] = phone
        if postal_code:
            data['postalCode'] = postal_code
        if address:
            data['address'] = address
        if address_number:
            data['addressNumber'] = address_number
        if province:
            data['province'] = province
        
        return self._make_request('POST', 'customers', data)
    
    def get_customer(self, customer_id: str) -> Dict:
        """Get customer details from Asaas."""
        return self._make_request('GET', f'customers/{customer_id}')
    
    def create_pix_payment(
        self,
        customer_id: str,
        value: Decimal,
        due_date: date,
        description: str,
        external_reference: Optional[str] = None
    ) -> Dict:
        """
        Create a PIX payment in Asaas.
        
        Args:
            customer_id: Asaas customer ID
            value: Payment amount
            due_date: Payment due date
            description: Payment description
            external_reference: External reference (e.g., enrollment ID)
            
        Returns:
            Payment data with PIX QR code and copy-paste code
        """
        data = {
            'customer': customer_id,
            'billingType': 'PIX',
            'value': float(value),
            'dueDate': due_date.strftime('%Y-%m-%d'),
            'description': description,
        }
        
        if external_reference:
            data['externalReference'] = external_reference
        
        return self._make_request('POST', 'payments', data)
    
    def create_credit_card_payment(
        self,
        customer_id: str,
        value: Decimal,
        description: str,
        external_reference: str,
        installments: int = 1,
        callback_success_url: Optional[str] = None,
        callback_auto_redirect: bool = True,
    ) -> dict:
        """
        Create a hosted credit card payment.
        
        Args:
            customer_id: Asaas customer ID
            value: Payment value
            description: Payment description
            external_reference: External reference ID
            installments: Number of installments
            callback_success_url: URL to return the customer to after payment
            callback_auto_redirect: Whether Asaas should redirect automatically
        
        Returns:
            Payment data from Asaas
        """
        from datetime import date as date_module
        
        payload = {
            'customer': customer_id,
            'billingType': 'CREDIT_CARD',
            'description': description,
            'externalReference': external_reference,
            'value': float(value),
            'dueDate': date_module.today().strftime('%Y-%m-%d'),
        }

        # Handle installments
        if installments > 1:
            per_installment = float(value) / installments
            payload['installmentCount'] = installments
            payload['installmentValue'] = round(per_installment, 2)

        if callback_success_url:
            payload['callback'] = {
                'successUrl': callback_success_url,
                'autoRedirect': callback_auto_redirect,
            }
        
        return self._make_request('POST', 'payments', payload)
    
    def create_subscription(
        self,
        customer_id: str,
        value: Decimal,
        billing_type: str,
        cycle: str,
        description: str,
        next_due_date: Optional[date] = None,
        external_reference: Optional[str] = None
    ) -> Dict:
        """
        Create a subscription in Asaas for recurring payments.
        
        Args:
            customer_id: Asaas customer ID
            value: Subscription value per cycle
            billing_type: PIX, CREDIT_CARD, BOLETO
            cycle: MONTHLY, WEEKLY, BIWEEKLY, etc.
            description: Subscription description
            next_due_date: First payment due date
            external_reference: External reference
            
        Returns:
            Subscription data
        """
        data = {
            'customer': customer_id,
            'billingType': billing_type,
            'value': float(value),
            'cycle': cycle,
            'description': description,
        }
        
        if next_due_date:
            data['nextDueDate'] = next_due_date.strftime('%Y-%m-%d')
        else:
            # Default to tomorrow
            data['nextDueDate'] = (timezone.now().date() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        if external_reference:
            data['externalReference'] = external_reference
        
        return self._make_request('POST', 'subscriptions', data)
    
    def get_payment(self, payment_id: str) -> Dict:
        """Get payment details from Asaas."""
        return self._make_request('GET', f'payments/{payment_id}')
    
    def get_pix_qrcode(self, payment_id: str) -> Dict:
        """
        Get PIX QR code for a payment.
        
        Returns:
            Dict with 'encodedImage' (base64) and 'payload' (copy-paste code)
        """
        return self._make_request('GET', f'payments/{payment_id}/pixQrCode')
    
    def cancel_payment(self, payment_id: str) -> Dict:
        """Cancel a payment in Asaas."""
        return self._make_request('DELETE', f'payments/{payment_id}')
    
    def refund_payment(self, payment_id: str, value: Optional[Decimal] = None) -> Dict:
        """
        Refund a payment.
        
        Args:
            payment_id: Asaas payment ID
            value: Partial refund amount (optional, full refund if not provided)
            
        Returns:
            Refund data
        """
        data = {}
        if value:
            data['value'] = float(value)
        
        return self._make_request('POST', f'payments/{payment_id}/refund', data)
    
    def list_payments(
        self,
        customer_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict:
        """
        List payments with filters.
        
        Args:
            customer_id: Filter by customer
            status: Filter by status (PENDING, RECEIVED, CONFIRMED, etc.)
            limit: Results per page
            offset: Pagination offset
            
        Returns:
            Dict with 'data' (list of payments) and pagination info
        """
        params = {
            'limit': limit,
            'offset': offset
        }
        
        if customer_id:
            params['customer'] = customer_id
        if status:
            params['status'] = status
        
        # Build query string
        query_string = '&'.join([f'{k}={v}' for k, v in params.items()])
        
        return self._make_request('GET', f'payments?{query_string}')
