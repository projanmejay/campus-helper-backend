import 'package:flutter/foundation.dart';

class CartItem {
  final String id;
  final String name;
  final int price;
  int qty;

  CartItem({
    required this.id,
    required this.name,
    required this.price,
    this.qty = 1,
  });
}

class CartProvider extends ChangeNotifier {
  // 🆕 cart per canteen
  final Map<String, Map<String, CartItem>> _canteenCarts = {};

  String? _activeCanteen;

  // ---------------- CANTEEN CONTROL ----------------
  void setActiveCanteen(String canteen) {
    _activeCanteen = canteen;
    _canteenCarts.putIfAbsent(canteen, () => {});
    notifyListeners();
  }

  Map<String, CartItem> get _activeCart {
    if (_activeCanteen == null) return {};
    return _canteenCarts[_activeCanteen!]!;
  }

  // ---------------- GETTERS ----------------
  List<CartItem> get items => _activeCart.values.toList();

  int get totalItems =>
      _activeCart.values.fold(0, (s, e) => s + e.qty);

  int get totalAmount =>
      _activeCart.values.fold(0, (s, e) => s + (e.price * e.qty));

  // ---------------- CART ACTIONS ----------------
  void addItem(String id, String name, int price) {
    if (_activeCanteen == null) return;

    final cart = _activeCart;

    if (cart.containsKey(id)) {
      cart[id]!.qty++;
    } else {
      cart[id] = CartItem(id: id, name: name, price: price);
    }
    notifyListeners();
  }

  void removeSingle(String id) {
    if (_activeCanteen == null) return;

    final cart = _activeCart;
    if (!cart.containsKey(id)) return;

    if (cart[id]!.qty > 1) {
      cart[id]!.qty--;
    } else {
      cart.remove(id);
    }
    notifyListeners();
  }

  void removeItem(String id) {
    if (_activeCanteen == null) return;
    _activeCart.remove(id);
    notifyListeners();
  }

  void clearCart() {
    if (_activeCanteen == null) return;
    _activeCart.clear();
    notifyListeners();
  }

  // ---------------- ORDER PAYLOAD ----------------
  Map<String, int> toOrderItemsMap() {
    final map = <String, int>{};
    for (final it in _activeCart.values) {
      map[it.id] = it.qty;
    }
    return map;
  }
}
