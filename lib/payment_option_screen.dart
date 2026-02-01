import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:razorpay_flutter/razorpay_flutter.dart';

/*
  🔴 PRODUCTION BACKEND (Railway HTTPS)
*/
const String BACKEND_BASE =
    'https://campus-helper-backend-production.up.railway.app';

/* ============================================================
   PAYMENT OPTION SCREEN
   ============================================================ */

class PaymentOptionScreen extends StatefulWidget {
  final String canteen;
  final int rotiQty;
  final int paneerQty;
  final int totalAmount;

  const PaymentOptionScreen({
    super.key,
    required this.canteen,
    required this.rotiQty,
    required this.paneerQty,
    required this.totalAmount,
  });

  @override
  State<PaymentOptionScreen> createState() =>
      _PaymentOptionScreenState();
}

class _PaymentOptionScreenState extends State<PaymentOptionScreen> {
  late Razorpay _razorpay;
  String? _currentOrderId;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();

    _razorpay.on(
        Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess);
    _razorpay.on(
        Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError);
    _razorpay.on(
        Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  /* ------------------ CREATE BACKEND ORDER ------------------ */
  Future<Map<String, dynamic>> _createOrder() async {
    final resp = await http.post(
      Uri.parse('$BACKEND_BASE/order'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'canteen': widget.canteen,
        'items': {
          'roti': widget.rotiQty,
          'paneer_butter_masala': widget.paneerQty,
        },
        'totalAmount': widget.totalAmount,
      }),
    );

    if (resp.statusCode == 200 || resp.statusCode == 201) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    } else {
      throw Exception(
          'Backend error ${resp.statusCode}: ${resp.body}');
    }
  }

  /* ------------------ START RAZORPAY PAYMENT ------------------ */
  Future<void> _startRazorpayPayment(String orderId) async {
    final resp = await http.post(
      Uri.parse('$BACKEND_BASE/razorpay/create-order'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'orderId': orderId}),
    );

    final data = jsonDecode(resp.body);

    final options = {
      'key': data['key'], // rzp_test_xxx
      'amount': data['amount'], // in paise
      'currency': data['currency'],
      'name': 'Campus Helper',
      'description': 'Food Order Payment',
      'order_id': data['razorpayOrderId'],
      'method': {'upi': true},
    };

    _razorpay.open(options);
  }

  /* ------------------ RAZORPAY CALLBACKS ------------------ */
  Future<void> _onPaymentSuccess(
      PaymentSuccessResponse response) async {
    await http.post(
      Uri.parse('$BACKEND_BASE/razorpay/verify-payment'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'razorpay_payment_id': response.paymentId,
        'razorpay_order_id': response.orderId,
        'razorpay_signature': response.signature,
      }),
    );

    if (!mounted || _currentOrderId == null) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => PendingPaymentScreen(
          orderId: _currentOrderId!,
          canteenName: widget.canteen,
        ),
      ),
    );
  }

  void _onPaymentError(PaymentFailureResponse response) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            'Payment failed: ${response.message ?? 'Cancelled'}'),
      ),
    );
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content:
            Text('External Wallet: ${response.walletName}'),
      ),
    );
  }

  /* ------------------ PAY BUTTON HANDLER ------------------ */
  void _handlePay(BuildContext context) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) =>
          const Center(child: CircularProgressIndicator()),
    );

    try {
      final order = await _createOrder();
      if (!context.mounted) return;
      Navigator.pop(context);

      _currentOrderId = order['orderId'].toString();

      await _startRazorpayPayment(_currentOrderId!);
    } catch (e) {
      if (context.mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /* ------------------ UI ------------------ */
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Confirm Payment')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Order Details',
              style:
                  TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Card(
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Canteen: ${widget.canteen}'),
                    if (widget.rotiQty > 0)
                      Text('Roti x ${widget.rotiQty}'),
                    if (widget.paneerQty > 0)
                      Text(
                          'Paneer Butter Masala x ${widget.paneerQty}'),
                    const Divider(),
                    Text(
                      'Total Amount: ₹${widget.totalAmount}',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.payment),
                label: const Text(
                  'PAY NOW',
                  style: TextStyle(fontSize: 18),
                ),
                onPressed: () => _handlePay(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/* ============================================================
   PENDING PAYMENT SCREEN
   ============================================================ */

class PendingPaymentScreen extends StatefulWidget {
  final String orderId;
  final String canteenName;

  const PendingPaymentScreen({
    super.key,
    required this.orderId,
    required this.canteenName,
  });

  @override
  State<PendingPaymentScreen> createState() =>
      _PendingPaymentScreenState();
}

class _PendingPaymentScreenState extends State<PendingPaymentScreen> {
  Timer? _pollTimer;
  Timer? _countdownTimer;
  int _remainingSeconds = 5 * 60;
  String _status = 'PENDING_PAYMENT';

  @override
  void initState() {
    super.initState();
    _startTimers();
  }

  void _startTimers() {
    _countdownTimer =
        Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_remainingSeconds > 0) {
          _remainingSeconds--;
        }
      });
    });

    _pollTimer =
        Timer.periodic(const Duration(seconds: 5), (_) {
      _checkStatus();
    });

    _checkStatus();
  }

  Future<void> _checkStatus() async {
    try {
      final resp = await http.get(
        Uri.parse(
          '$BACKEND_BASE/order/${widget.orderId}/status',
        ),
      );

      if (resp.statusCode == 200) {
        final j = jsonDecode(resp.body);
        final status = j['status'];

        if (!mounted) return;
        setState(() => _status = status);

        if (status == 'PAID') {
          _stopTimers();
          await showDialog(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Payment confirmed'),
              content:
                  const Text('Your order was confirmed.'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
          if (mounted) {
            Navigator.popUntil(
                context, (route) => route.isFirst);
          }
        }
      }
    } catch (_) {}
  }

  void _stopTimers() {
    _pollTimer?.cancel();
    _countdownTimer?.cancel();
  }

  @override
  void dispose() {
    _stopTimers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment Pending')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text('Status: $_status'),
          ],
        ),
      ),
    );
  }
}
